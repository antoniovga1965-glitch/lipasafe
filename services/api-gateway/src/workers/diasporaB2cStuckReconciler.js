'use strict'
const prisma  = require('../utils/prisma')
const logger  = require('../utils/logger')
const redis   = require('../utils/redis')
const { queryB2cStatus } = require('./payoutReconciler')
const { handleDiasporaPayoutNotConfirmed } = require('../../controllers/diasporaPayoutTransitions')

const STUCK_THRESHOLD_MS = 10 * 60 * 1000
const SWEEP_INTERVAL_MS  = 5 * 60 * 1000

// Recovers diaspora milestones stuck in PAYOUT_PROCESSING because the B2C
// result callback never arrived (network issue, Safaricom outage, etc).
// Unlike houseB2cStuckReconciler (which recovers jobs that never reached
// Safaricom at all, so re-firing is always safe), here initiateB2C DID
// reach Safaricom — we genuinely don't know the outcome. So we ALWAYS query
// Safaricom's TransactionStatus API first. Only a definitive non-success
// answer (or a definitive query failure signal) is treated as failure and
// handed to handleDiasporaPayoutNotConfirmed for refund+retry. We never
// treat "time passed" alone as failure — that could double-pay the worker.
async function reconcileStuckDiasporaPayouts() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  let stuck
  try {
    stuck = await prisma.diasporaMilestone.findMany({
      where:   { status: 'PAYOUT_PROCESSING', updatedAt: { lte: cutoff } },
      include: { deal: true },
      take: 20
    })
  } catch (err) {
    logger.error('diasporaB2cStuckReconciler: query failed', { err: err.message })
    return
  }

  if (stuck.length === 0) return
  logger.warn(`diasporaB2cStuckReconciler: found ${stuck.length} stuck milestone(s)`, {
    ids: stuck.map(m => m.id)
  })

  for (const milestone of stuck) {
    try {
      const deal = milestone.deal
      const floatRef = `FPAY-${deal.reference}-M${milestone.order}`

      const alreadySeen = await prisma.auditLog.findFirst({
        where: { entityId: milestone.id, action: 'diaspora_reconciler_checked', createdAt: { gte: new Date(Date.now() - SWEEP_INTERVAL_MS) } }
      })
      if (alreadySeen) continue

      const statusRes = await queryB2cStatus(floatRef)

      await prisma.auditLog.create({
        data: {
          actorType:  'system',
          action:     'diaspora_reconciler_checked',
          entityType: 'DiasporaMilestone',
          entityId:   milestone.id,
          newState:   { floatRef, statusResultCode: statusRes?.ResultCode ?? null }
        }
      })

      if (statusRes?.ResultCode === '0') {
        // Safaricom confirms the payout actually went through — the
        // callback was just lost. Finalize exactly like the callback would.
        // Atomic claim: same guard as the callback controller, so if the
        // real callback lands in the same instant this sweep runs, only one
        // of them proceeds past this point.
        const claim = await prisma.diasporaMilestone.updateMany({
          where: { id: milestone.id, status: 'PAYOUT_PROCESSING' },
          data:  { status: 'RELEASED', releasedAt: new Date() }
        })
        if (claim.count === 0) {
          logger.info('diasporaB2cStuckReconciler: lost race, already settled elsewhere', { milestoneId: milestone.id })
          continue
        }
        await redis.del(`diaspora:retry:${milestone.id}`)
        await redis.del(`originator:${floatRef}`)

        const freshMilestones = await prisma.diasporaMilestone.findMany({ where: { dealId: deal.id } })
        const allReleased = freshMilestones.every(m => m.status === 'RELEASED')
        await prisma.diasporaDeal.update({
          where: { id: deal.id },
          data:  { status: allReleased ? 'COMPLETED' : 'ACTIVE' }
        })

        await prisma.auditLog.create({
          data: {
            actorType:  'system',
            action:     'diaspora_reconciler_confirmed_via_query',
            entityType: 'DiasporaMilestone',
            entityId:   milestone.id,
            newState:   { note: 'Safaricom status query confirmed payment — callback was lost' }
          }
        })
        logger.warn('diasporaB2cStuckReconciler: confirmed via query, marked RELEASED', { milestoneId: milestone.id })

      } else if (statusRes && statusRes.ResultCode !== undefined) {
        // Safaricom gave a definitive non-success answer — safe to refund + retry.
        logger.warn('diasporaB2cStuckReconciler: Safaricom confirms non-success — reverting', { milestoneId: milestone.id, resultCode: statusRes.ResultCode })
        await handleDiasporaPayoutNotConfirmed(milestone.id, {
          reason: 'timeout_query_confirmed_failed', resultCode: statusRes.ResultCode, resultDesc: statusRes.ResultDesc
        })
      } else {
        // Query itself failed/inconclusive (network error, Safaricom down).
        // Do NOT revert on an inconclusive answer — wait for the next sweep.
        logger.warn('diasporaB2cStuckReconciler: status query inconclusive — will retry next sweep', { milestoneId: milestone.id })
      }
    } catch (err) {
      logger.error('diasporaB2cStuckReconciler: failed to process stuck milestone', { milestoneId: milestone.id, err: err.message })
    }
  }
}

reconcileStuckDiasporaPayouts()
const interval = setInterval(reconcileStuckDiasporaPayouts, SWEEP_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('Diaspora B2C stuck-payout reconciler started — sweeping every 5 minutes')
module.exports = { reconcileStuckDiasporaPayouts }
