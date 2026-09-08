'use strict'
const prisma          = require('../utils/prisma')
const logger          = require('../utils/logger')
const Decimal         = require('decimal.js')
const redis           = require('../utils/redis')
const { initiateB2C } = require('../utils/mpesaB2C')

// B2C normally confirms in < 2 min — 15 min means something died
const STUCK_THRESHOLD_MS = 15 * 60 * 1000
const SWEEP_INTERVAL_MS  =  5 * 60 * 1000

// originatorId is deterministic — same id = Safaricom deduplicates via 500.002.1001
// so re-calling initiateB2C with the same originatorId is always safe

async function reconcileStuckTransfers() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  // ── RELEASING: accept B2C initiated but never confirmed ──────────
  let stuckReleasing = []
  try {
    stuckReleasing = await prisma.protectedTransfer.findMany({
      where:   { state: 'RELEASING', updatedAt: { lte: cutoff } },
      include: { sender: { select: { phone: true } } },
      take: 50,
    })
  } catch (err) {
    logger.error('ptStuckReconciler: RELEASING query failed', { err: err.message })
  }

  for (const t of stuckReleasing) {
    try {
      const originatorId = `PT-ACC-${t.id.slice(0, 16)}`
      const amount       = new Decimal(t.amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()

      // Refresh Redis key in case it expired or was never set
      await redis.set(`originator:${originatorId}`, `protected_transfer:${t.id}`, 'EX', 86400)
      await initiateB2C({
        phone:         t.recipientPhone,
        amount,
        originatorId,
        transactionId: t.id,
        remarks:       `SafeSend recon ${t.id.slice(0, 8)}`
      })
      logger.warn('ptStuckReconciler: re-initiated B2C for stuck RELEASING',
        { transferId: t.id, originatorId })
    } catch (err) {
      logger.error('ptStuckReconciler: CRITICAL — RELEASING re-initiate failed',
        { transferId: t.id, err: err.message })
    }
  }

  // ── REFUNDING: decline/cancel B2C initiated but never confirmed ───
  let stuckRefunding = []
  try {
    stuckRefunding = await prisma.protectedTransfer.findMany({
      where:   { state: 'REFUNDING', updatedAt: { lte: cutoff } },
      include: { sender: { select: { phone: true } } },
      take: 50,
    })
  } catch (err) {
    logger.error('ptStuckReconciler: REFUNDING query failed', { err: err.message })
  }

  for (const t of stuckRefunding) {
    try {
      // declinedAt set → decline action (PT-DEC), cancelledAt set → cancel (PT-CAN)
      const prefix = t.declinedAt ? 'PT-DEC' : 'PT-CAN'
      if (!t.declinedAt && !t.cancelledAt) {
        logger.warn('ptStuckReconciler: REFUNDING transfer has neither declinedAt nor cancelledAt',
          { transferId: t.id })
      }
      const originatorId = `${prefix}-${t.id.slice(0, 16)}`
      const amount       = new Decimal(t.amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()

      await redis.set(`originator:${originatorId}`, `protected_transfer:${t.id}`, 'EX', 86400)
      await initiateB2C({
        phone:         t.sender.phone,
        amount,
        originatorId,
        transactionId: t.id,
        remarks:       `SafeSend refund recon ${t.id.slice(0, 8)}`
      })
      logger.warn('ptStuckReconciler: re-initiated B2C for stuck REFUNDING',
        { transferId: t.id, originatorId, prefix })
    } catch (err) {
      logger.error('ptStuckReconciler: CRITICAL — REFUNDING re-initiate failed',
        { transferId: t.id, err: err.message })
    }
  }
}

reconcileStuckTransfers()
const interval = setInterval(reconcileStuckTransfers, SWEEP_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('ProtectedTransfer stuck reconciler started — sweeping every 5 minutes')
module.exports = { reconcileStuckTransfers }
