'use strict'
const prisma = require('../utils/prisma')
const redis  = require('../utils/redis')
const logger = require('../utils/logger')
const pw     = require('../utils/platformWallet')
const fundiQueue = require('../queues/fundiQueue')
const { syncFundiEscrowStatus } = require('../utils/fundiEscrowStatus')
const STUCK_THRESHOLD_MS = 10 * 60 * 1000
const ADMIN_PHONE = process.env.ADMIN_PHONE

const reconcileStuckFundiPayouts = async () => {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  // Query FundiPayout directly, not FundiJob.status/originatorConversationId.
  // The shared FundiJob column gets overwritten when both legs of a PARTIAL
  // dispute decision fire at once; FundiPayout has one row per (job, type)
  // so both legs are independently visible and reconciled. This also covers
  // refunds from cancelJob/resolveDispute, which move FundiJob.status to a
  // terminal value (CANCELLED/RESOLVED) immediately and were previously
  // invisible to this query entirely.
  const stuck = await prisma.fundiPayout.findMany({
    where: { status: { in: ['pending', 'sent'] }, initiatedAt: { lte: cutoff } },
    include: { fundiJob: true },
    take: 20
  })

  if (stuck.length === 0) return
  logger.warn(`fundiPayoutReconciler: found ${stuck.length} stuck fundi payout(s)`, { ids: stuck.map(p => p.id) })

  for (const payout of stuck) {
    const job  = payout.fundiJob
    const type = payout.payoutType // 'payout' | 'refund'
    if (!job) {
      logger.error('fundiPayoutReconciler: payout row has no parent job', { payoutId: payout.id })
      continue
    }

    try {
      if (payout.originatorConversationId.startsWith('init_')) {
        // The B2C call never actually went out (worker likely crashed between
        // the upsert and the real Safaricom call). Nothing to query yet —
        // skip rather than asking Safaricom about an ID it's never seen.
        continue
      }

      const { queryB2cStatus } = require('./payoutReconciler')
      const statusRes = await queryB2cStatus(payout.originatorConversationId)

      if (statusRes?.ResultCode === '0') {
        const mpesaRef = statusRes?.TransactionID || null
        logger.warn('fundiPayoutReconciler: Safaricom confirms — completing', { jobId: job.id, payoutId: payout.id, type })

        if (type === 'payout') {
          const fundiFee = Number(job.serviceFee)
          await prisma.$transaction(async (tx) => {
            const result = await tx.fundiJob.updateMany({
              where: { id: job.id, status: { not: 'COMPLETED' } },
              data:  { status: 'COMPLETED', completedAt: new Date(), mpesaRef }
            })
            await tx.fundiPayout.updateMany({
              where: { id: payout.id, status: { not: 'completed' } },
              data:  { status: 'completed', mpesaRef, resultCode: 0, completedAt: new Date() }
            })
            if (result.count > 0 && fundiFee > 0) await pw.credit(tx, fundiFee, job.id)
          })
          await syncFundiEscrowStatus(prisma, job.id)
          await fundiQueue.add('send_raw_sms', { phone: job.fundiPhone, message: `LipaSafe: Umepokea KES ${job.fundiReceives || job.amount} kwa kazi ${job.id.slice(0,8).toUpperCase()}.` })
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.fundiJob.updateMany({
              where: { id: job.id, status: { not: 'REFUNDED' } },
              data:  { status: 'REFUNDED', mpesaRef }
            })
            await tx.fundiPayout.updateMany({
              where: { id: payout.id, status: { not: 'completed' } },
              data:  { status: 'completed', mpesaRef, resultCode: 0, completedAt: new Date() }
            })
          })
          await syncFundiEscrowStatus(prisma, job.id)
          await fundiQueue.add('send_raw_sms', { phone: job.buyerPhone, message: `LipaSafe: Refund ya KES ${job.amount} imetumwa kwako. Ref: ${mpesaRef || ''}` })
        }
        continue
      }

      const retryKey     = `fundi:b2c:retry:${type}:${job.id}`
      const escalatedKey = `fundi:b2c:escalated:${type}:${job.id}`
      const retryCount   = parseInt(await redis.get(retryKey) || '0', 10)

      if (retryCount < 3) {
        const delays = [2*60*1000, 5*60*1000, 10*60*1000]
        await redis.set(retryKey, retryCount + 1, 'EX', 86400)
        await prisma.fundiPayout.updateMany({
          where: { id: payout.id, status: { not: 'completed' } },
          data:  { status: 'pending', resultCode: statusRes?.ResultCode != null ? Number(statusRes.ResultCode) : null, resultDesc: statusRes?.ResultDesc || null }
        })
        if (type === 'payout') {
          await fundiQueue.add('payout_fundi',
            { jobId: job.id, fundiPhone: job.fundiPhone, amount: (job.fundiReceives || job.amount).toString() },
            { delay: delays[retryCount] })
        } else {
          await fundiQueue.add('refund_buyer',
            { jobId: job.id, buyerId: job.buyerId, amount: job.amount.toString() },
            { delay: delays[retryCount] })
        }
        logger.warn('fundiPayoutReconciler: requeued', { jobId: job.id, type, attempt: retryCount + 1 })
      } else {
        const alreadyEscalated = await redis.get(escalatedKey)
        if (!alreadyEscalated) {
          if (ADMIN_PHONE) {
            await fundiQueue.add('send_raw_sms', {
              phone: ADMIN_PHONE,
              message: `LIPASAFE CRITICAL: Fundi ${type} stuck, no Safaricom confirmation after retries. Job: ${job.id.slice(0,8).toUpperCase()}. Manual check required.`
            })
          }
          logger.error('fundiPayoutReconciler: escalated to admin', { jobId: job.id, type })
        }

        await prisma.fundiPayout.updateMany({
          where: { id: payout.id, status: { not: 'failed' } },
          data:  {
            status: 'failed',
            resultCode: statusRes?.ResultCode != null ? Number(statusRes.ResultCode) : null,
            resultDesc: statusRes?.ResultDesc || 'stuck_no_confirmation',
            failedAt: new Date()
          }
        })
        await syncFundiEscrowStatus(prisma, job.id)
        if (type === 'payout') {
          await prisma.fundiJob.updateMany({
            where: { id: job.id, status: 'AWAITING_PAYOUT' },
            data:  { status: 'PAYOUT_FAILED' }
          })
        }

        await redis.set(escalatedKey, '1', 'EX', 86400)
        await redis.set(retryKey, retryCount, 'EX', 86400)
      }
    } catch (err) {
      logger.error('fundiPayoutReconciler: failed to process payout', { jobId: job.id, payoutId: payout.id, err: err.message })
    }
  }
}

module.exports = { reconcileStuckFundiPayouts }
