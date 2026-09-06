'use strict'
const prisma  = require('../src/utils/prisma')
const logger  = require('../src/utils/logger')
const redis   = require('../src/utils/redis')
const { FLOAT_ID }               = require('../src/utils/diasporaConstants')
const { calcFeesDiaspora }       = require('../src/utils/feeCalculator')
const { debit: debitPlatform }   = require('../src/utils/platformWallet')

/**
 * Single source of truth for "diaspora payout did not confirm" — covers both
 * explicit Safaricom failure (ResultCode !== 0) and timeout (no callback
 * received in time, detected by the reconciler). Mirrors
 * payoutTransitions.js:handlePayoutNotConfirmed for the order/B2B flow.
 *
 * IMPORTANT: only call this once you are NOT relying on an ongoing implicit
 * assumption that the payout might still land later without you knowing —
 * i.e. either Safaricom told us it failed, or the reconciler actively
 * queried Safaricom and got a non-success answer. Never call this purely
 * because time passed, without a definitive check.
 */
const handleDiasporaPayoutNotConfirmed = async (milestoneId, { reason, resultCode, resultDesc }) => {
  const milestone = await prisma.diasporaMilestone.findUnique({
    where:   { id: milestoneId },
    include: { deal: true }
  })
  if (!milestone) {
    logger.error('handleDiasporaPayoutNotConfirmed: milestone not found', { milestoneId, reason })
    return
  }

  // Already resolved — don't double-refund. RELEASED means it actually
  // succeeded (possibly a late callback for something already reconciled);
  // PAYOUT_FAILED means someone already processed this failure.
  if (milestone.status !== 'PAYOUT_PROCESSING') {
    logger.info('handleDiasporaPayoutNotConfirmed: milestone not in PAYOUT_PROCESSING, skipping', {
      milestoneId, currentStatus: milestone.status, reason
    })
    return
  }

  const deal = milestone.deal
  const { platformFee, b2cCharge, workerReceives } = calcFeesDiaspora(milestone.amount)
  const totalDeduct = Number(workerReceives) + Number(b2cCharge)
  const floatRef = `FPAY-${deal.reference}-M${milestone.order}`

  const retryKey   = `diaspora:retry:${milestoneId}`
  const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
  const nextAttempt = retryCount + 1

  let claimed = false

  await prisma.$transaction(async (tx) => {
    // Atomic claim: the status flip itself is the lock. If another caller
    // (e.g. the stuck-reconciler firing at the same moment as this callback)
    // already flipped this milestone, count comes back 0 and we do NOT touch
    // the float or platform wallet — prevents a double-refund/double-debit
    // race between the two triggers that can both call this function.
    const claim = await tx.diasporaMilestone.updateMany({
      where: { id: milestoneId, status: 'PAYOUT_PROCESSING' },
      data:  { status: 'PAYOUT_FAILED' }
    })
    if (claim.count === 0) {
      logger.info('handleDiasporaPayoutNotConfirmed: lost race, already claimed', { milestoneId, reason })
      return
    }
    claimed = true

    await tx.diasporaFloat.update({
      where: { id: FLOAT_ID },
      data:  { balance: { increment: totalDeduct }, lastUpdated: new Date() }
    })

    const reversalRef = `${floatRef}-reversal-${Date.now()}`
    await tx.diasporaFloatTx.create({
      data: {
        floatId:     FLOAT_ID,
        type:        'REVERSAL',
        amount:      totalDeduct,
        reference:   reversalRef,
        dealRef:     deal.reference,
        milestoneId: milestone.id,
        note:        `Payout not confirmed (${reason}) — reservation returned to float. resultCode=${resultCode ?? 'n/a'} resultDesc=${resultDesc ?? 'n/a'}`
      }
    })

    await debitPlatform(tx, Number(platformFee), `PF-${floatRef}-reversal-${nextAttempt}`,
      `Diaspora platform fee reversal — deal ${deal.reference} milestone M${milestone.order} (attempt ${nextAttempt})`)

    await tx.auditLog.create({
      data: {
        actorType:  'system',
        action:     reason === 'timeout' ? 'diaspora_payout_timeout' : 'diaspora_payout_failed',
        entityType: 'DiasporaMilestone',
        entityId:   milestoneId,
        newState:   { status: 'PAYOUT_FAILED', reason, resultCode, resultDesc, retryAttempt: nextAttempt }
      }
    })
  })

  if (!claimed) return

  await redis.del(`originator:${floatRef}`)

  if (nextAttempt <= 3) {
    const delays  = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
    const delayMs = delays[retryCount]

    await redis.set(retryKey, nextAttempt, 'EX', 86400)

    const b2cRetryQueue = require('../src/queues/b2cRetryQueue')
    await b2cRetryQueue.add(
      'retry_release',
      { type: 'diaspora', dealId: deal.id, milestoneId },
      { delay: delayMs }
    )

    logger.warn('Diaspora payout not confirmed — retry queued', {
      milestoneId, attempt: nextAttempt, delayMs, reason, resultCode, resultDesc
    })
  } else {
    await redis.del(retryKey)

    await prisma.auditLog.create({
      data: {
        actorType:  'system',
        action:     'diaspora_payout_escalated',
        entityType: 'DiasporaMilestone',
        entityId:   milestoneId,
        newState:   { note: 'Diaspora payout failed/timed out 3x — admin manual release required', reason, resultCode, resultDesc }
      }
    })

    const ADMIN_PHONE = process.env.ADMIN_PHONE
    if (ADMIN_PHONE) {
      const smsQueue = require('../src/queues/smsQueue')
      await smsQueue.add('sms_reply', {
        type:    'raw',
        phone:   ADMIN_PHONE,
        message: `LIPASAFE CRITICAL: Diaspora payout failed 3x for deal ${deal.reference} milestone M${milestone.order}. KES ${Number(workerReceives).toFixed(2)} to ${deal.recipientPhone}. Reason: ${reason}. Manual release required NOW.`
      })
    }

    logger.error('Diaspora payout not confirmed — escalated after 3 attempts', {
      milestoneId, reason, resultCode, resultDesc, attempts: nextAttempt
    })
  }
}

module.exports = { handleDiasporaPayoutNotConfirmed }
