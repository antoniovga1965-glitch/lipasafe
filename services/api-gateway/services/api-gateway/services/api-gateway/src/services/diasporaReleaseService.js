'use strict'
const prisma                     = require('../utils/prisma')
const logger                     = require('../utils/logger')
const redis                      = require('../utils/redis')
const { FLOAT_ID }               = require('../utils/diasporaConstants')
const { calcFeesDiaspora }       = require('../utils/feeCalculator')
const { initiateB2C }            = require('../utils/mpesaB2C')
const { credit: creditPlatform, debit: debitPlatform } = require('../utils/platformWallet')
const { sendSMSSafe }            = require('../services/smsService')
const { createAndSend }          = require('../services/notificationService')

/**
 * Atomically release a diaspora milestone. Shared by releaseFunds controller
 * and diasporaAutoReleaseWorker — auth/ownership checks stay in the caller,
 * this only handles the money-moving invariants.
 */
const executeDiasporaRelease = async ({ dealId, milestoneId, releasedBy }) => {
  const deal = await prisma.diasporaDeal.findUnique({
    where:   { id: dealId },
    include: { milestones: true }
  })
  if (!deal) return { success: false, code: 'NOT_FOUND', message: 'Deal not found' }

  const milestone = deal.milestones.find(m => m.id === milestoneId)
  if (!milestone) return { success: false, code: 'NOT_FOUND', message: 'Milestone not found' }

  // PAYOUT_FAILED is retryable — the reservation was already reverted when
  // it entered that state, so it's safe to attempt release again from there.
  if (milestone.status !== 'WORK_SUBMITTED' && milestone.status !== 'PAYOUT_FAILED')
    return { success: false, code: 'WRONG_STATE', message: `Milestone is ${milestone.status}, expected WORK_SUBMITTED or PAYOUT_FAILED` }

  const { platformFee, b2cCharge, workerReceives } = calcFeesDiaspora(milestone.amount)
  const totalDeduct = Number(workerReceives) + Number(b2cCharge)
  const floatRef     = `FPAY-${deal.reference}-M${milestone.order}`

  try {
    await prisma.$transaction(async (tx) => {
      const floatBefore = await tx.diasporaFloat.findUnique({ where: { id: FLOAT_ID } })

      const floatLock = await tx.diasporaFloat.updateMany({
        where: { id: FLOAT_ID, balance: { gte: totalDeduct } },
        data:  { balance: { decrement: totalDeduct }, lastUpdated: new Date() }
      })
      if (floatLock.count === 0)
        throw Object.assign(new Error('INSUFFICIENT_FLOAT'), { code: 'INSUFFICIENT_FLOAT', balance: floatBefore?.balance ?? 0, need: totalDeduct })

      // Idempotency lock — double-taps / duplicate jobs get count=0 and bail.
      // NOTE: money is reserved here, but the milestone is NOT marked RELEASED
      // yet — it only becomes RELEASED once the B2C payout actually succeeds,
      // further down. Until then it sits in PAYOUT_PROCESSING so a failed
      // payout is visible instead of silently claiming success.
      const locked = await tx.diasporaMilestone.updateMany({
        where: { id: milestoneId, status: { in: ['WORK_SUBMITTED', 'PAYOUT_FAILED'] } },
        data:  { status: 'PAYOUT_PROCESSING' }
      })
      if (locked.count === 0)
        throw Object.assign(new Error('ALREADY_RELEASED'), { code: 'ALREADY_RELEASED' })

      // upsert, not create — floatRef is deterministic so a retry after a
      // reverted PAYOUT_FAILED reuses the same reference; create() would
      // throw on the unique constraint here.
      await tx.diasporaFloatTx.upsert({
        where:  { reference: floatRef },
        update: {
          amount: totalDeduct,
          note:   `Retry — worker: ${deal.recipientPhone} | receives: ${workerReceives} | B2C charge: ${b2cCharge}`
        },
        create: {
          floatId:     FLOAT_ID,
          type:        'B2C_PAYOUT',
          amount:      totalDeduct,
          reference:   floatRef,
          dealRef:     deal.reference,
          milestoneId: milestone.id,
          note:        `Worker: ${deal.recipientPhone} | receives: ${workerReceives} | B2C charge: ${b2cCharge}`
        }
      })

      // Platform fee — this was the missing piece; fee was being collected
      // from the buyer upfront but never credited to the platform wallet
      await creditPlatform(tx, Number(platformFee), `PF-${floatRef}`,
        `Diaspora platform fee — deal ${deal.reference} milestone M${milestone.order}`)
    })
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FLOAT')
      return { success: false, code: 'INSUFFICIENT_FLOAT', message: `Insufficient float. Need KES ${Number(err.need).toFixed(2)}, available KES ${Number(err.balance).toFixed(2)}` }
    if (err.code === 'ALREADY_RELEASED')
      return { success: false, code: 'ALREADY_RELEASED', message: 'Milestone already released — possible double-tap' }
    throw err
  }

  // initiateB2C() resolving without throwing means Safaricom ACCEPTED the
  // payout request — it does NOT mean the worker has been paid yet. The
  // authoritative outcome arrives later via the B2C result callback
  // (mpesaB2cCallback.controller.js), which is what finalizes RELEASED or
  // PAYOUT_FAILED. initiateB2C() already retries internally 3x before
  // throwing, so a throw here means Safaricom definitively would not accept
  // the request — in that case we revert immediately, matching the pattern
  // used by wallet.controller.js for instant sends.
  try {
    await initiateB2C({
      phone:         deal.recipientPhone,
      amount:        Number(workerReceives),
      originatorId:  floatRef,
      transactionId: floatRef,
      remarks:       `LipaSafe diaspora ${deal.reference}`
    })

    // Route the eventual Safaricom callback back to this milestone.
    await redis.set(`originator:${floatRef}`, `diaspora_payout:${milestoneId}`, 'EX', 86400)

    logger.info({ dealId, milestoneId, floatRef, workerReceives: Number(workerReceives) }, 'Diaspora B2C request accepted — awaiting callback')
    return {
      success: true,
      pending: true,
      code: 'PAYOUT_PENDING',
      message: 'Payout request accepted. Funds will be released to the worker once M-Pesa confirms.'
    }
  } catch (b2cErr) {
    logger.error({ err: b2cErr.message, floatRef, milestoneId }, 'Diaspora B2C request rejected — reverting reservation')

    await prisma.$transaction(async (tx) => {
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
          note:        `B2C request rejected — reservation returned to float. Reason: ${b2cErr.message}`
        }
      })
      await debitPlatform(tx, Number(platformFee), `PF-${floatRef}-reversal`,
        `Diaspora platform fee reversal — deal ${deal.reference} milestone M${milestone.order}`)
      await tx.diasporaMilestone.updateMany({
        where: { id: milestoneId, status: 'PAYOUT_PROCESSING' },
        data:  { status: 'PAYOUT_FAILED' }
      })
    })

    return {
      success: false,
      code: 'PAYOUT_FAILED',
      message: 'The M-Pesa payout request was rejected. Funds have been returned — you can try releasing this milestone again.'
    }
  }
}

module.exports = { executeDiasporaRelease }
