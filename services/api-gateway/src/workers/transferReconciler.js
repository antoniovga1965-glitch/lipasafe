'use strict'
const { Queue } = require('bullmq')
const prisma    = require('../utils/prisma')
const redis     = require('../utils/redis')
const logger    = require('../utils/logger')

const transferQueue         = new Queue('protectedTransfer', { connection: redis })
const RECONCILE_INTERVAL_MS = 15 * 60 * 1000   

const reconcile = async () => {
  const now = new Date()

  //  Directly expire transfers whose window has passed ──────────────
  // Catches cases where the BullMQ job was never enqueued or was dropped
  const overdue = await prisma.protectedTransfer.findMany({
    where:  { state: 'PENDING', expiresAt: { lt: now } },
    select: { id: true }
  })

  let expiredCount = 0
  for (const t of overdue) {
    await prisma.protectedTransfer.update({
      where: { id: t.id },
      data:  { state: 'EXPIRED' }
    })
    expiredCount++
    logger.info('Reconciler: expired overdue transfer', { transferId: t.id })
  }

  //  Re-enqueue missing expiry jobs for still-pending transfers ─────
  // Only look at transfers created > 2 mins ago (give the callback time to enqueue normally)
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000)
  const pending = await prisma.protectedTransfer.findMany({
    where:  { state: 'PENDING', expiresAt: { gt: now }, createdAt: { lt: twoMinsAgo } },
    select: { id: true, expiresAt: true }
  })

  let requeuedCount = 0
  for (const t of pending) {
    const jobId      = `expire-${t.id}`
    const existing   = await transferQueue.getJob(jobId)
    if (!existing) {
      const delay = Math.max(t.expiresAt.getTime() - Date.now(), 0)
      await transferQueue.add(
        'expire-transfer',
        { transferId: t.id },
        { jobId, delay }
      )
      requeuedCount++
      logger.info('Reconciler: re-enqueued expiry job', { transferId: t.id, delayMs: delay })
    }
  }

  if (expiredCount || requeuedCount) {
    logger.info('Reconciler run complete', { expiredCount, requeuedCount })
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────
const start = () => {
  logger.info('TransferReconciler started', { intervalMs: RECONCILE_INTERVAL_MS })
  reconcile().catch(e => logger.error('Reconciler initial run failed', { err: e.message }))
  setInterval(() => {
    reconcile().catch(e => logger.error('Reconciler run failed', { err: e.message }))
  }, RECONCILE_INTERVAL_MS)
}

module.exports = { start }
