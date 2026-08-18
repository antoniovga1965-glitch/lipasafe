'use strict'
const prisma     = require('../utils/prisma')
const logger      = require('../utils/logger')
const Decimal     = require('decimal.js')
const houseQueue  = require('../queues/houseQueue')

const STUCK_THRESHOLD_MS = 10 * 60 * 1000
const SWEEP_INTERVAL_MS  = 5 * 60 * 1000

// Recovers escrows where the B2C payout/refund job never made it into the
// queue (e.g. Redis was down when houseQueue.add() was called in
// confirmHouseEscrow / resolveHouseDispute — see CRITICAL logs from that
// catch block). Detection uses houseAuditLog 'PAYOUT_INITIATED' /
// 'REFUND_INITIATED' as source of truth (NOT queue job existence — BullMQ
// prunes completed jobs via removeOnComplete, so an absent job tells us
// nothing). If that row is missing past the threshold, Safaricom was never
// actually called, so re-queueing is safe and cannot double-pay.

async function alreadyInitiated(escrowId, action) {
  const row = await prisma.houseAuditLog.findFirst({ where: { escrowId, action } })
  return !!row
}

async function reconcileStuckHousePayouts() {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  let stuckConfirmed
  try {
    stuckConfirmed = await prisma.houseEscrow.findMany({
      where: { status: 'CONFIRMED', updatedAt: { lte: cutoff } },
      select: { id: true, sellerPhone: true, sellerReceives: true, amount: true },
      take: 50,
    })
  } catch (err) {
    logger.error('houseB2cStuckReconciler: CONFIRMED query failed', { err: err.message })
    stuckConfirmed = []
  }

  for (const e of stuckConfirmed) {
    try {
      if (await alreadyInitiated(e.id, 'PAYOUT_INITIATED')) continue

      await houseQueue.add('payout_seller', {
        escrowId: e.id,
        sellerPhone: e.sellerPhone,
        sellerReceives: (e.sellerReceives || e.amount).toString(),
      }, { jobId: `house-payout-recon-${e.id}-${Date.now()}` })

      await prisma.houseAuditLog.create({
        data: { escrowId: e.id, action: 'RECONCILER_REQUEUED_PAYOUT',
          meta: { note: 'CONFIRMED escrow had no PAYOUT_INITIATED past threshold — original enqueue likely failed, re-queued' } },
      })
      logger.warn('houseB2cStuckReconciler: re-queued stuck payout', { escrowId: e.id })
    } catch (err) {
      logger.error('houseB2cStuckReconciler: CRITICAL — re-queue attempt failed (queue still down?)', { escrowId: e.id, err: err.message })
    }
  }

  let stuckDisputes
  try {
    stuckDisputes = await prisma.houseDispute.findMany({
      where: { status: 'RESOLVED', resolvedAt: { lte: cutoff }, decision: { in: ['FULL_REFUND', 'FULL_RELEASE'] } },
      include: { escrow: true },
      take: 50,
    })
  } catch (err) {
    logger.error('houseB2cStuckReconciler: dispute query failed', { err: err.message })
    stuckDisputes = []
  }

  for (const d of stuckDisputes) {
    const escrow = d.escrow
    if (!escrow || escrow.status !== 'DISPUTED') continue

    try {
      if (d.decision === 'FULL_REFUND') {
        if (await alreadyInitiated(escrow.id, 'REFUND_INITIATED')) continue
        const refundAmt = new Decimal(escrow.amount).minus(new Decimal(escrow.platformFee || 0))
        await houseQueue.add('refund_buyer', {
          escrowId: escrow.id, buyerId: escrow.buyerId, amount: refundAmt.toString(),
        }, { jobId: `dispute-refund-recon-${d.id}-${Date.now()}` })
      } else {
        if (await alreadyInitiated(escrow.id, 'PAYOUT_INITIATED')) continue
        const releaseAmt = new Decimal(escrow.sellerReceives || escrow.amount)
        await houseQueue.add('payout_seller', {
          escrowId: escrow.id, sellerPhone: escrow.sellerPhone, sellerReceives: releaseAmt.toString(),
        }, { jobId: `dispute-release-recon-${d.id}-${Date.now()}` })
      }

      await prisma.houseAuditLog.create({
        data: { escrowId: escrow.id, action: 'RECONCILER_REQUEUED_DISPUTE_PAYOUT',
          meta: { disputeId: d.id, decision: d.decision, note: 'Resolved dispute had no INITIATED record past threshold — re-queued' } },
      })
      logger.warn('houseB2cStuckReconciler: re-queued stuck dispute payout', { escrowId: escrow.id, disputeId: d.id })
    } catch (err) {
      logger.error('houseB2cStuckReconciler: CRITICAL — dispute re-queue failed (queue still down?)', { escrowId: escrow.id, disputeId: d.id, err: err.message })
    }
  }
}

reconcileStuckHousePayouts()
const interval = setInterval(reconcileStuckHousePayouts, SWEEP_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('House B2C stuck-payout reconciler started — sweeping every 5 minutes')
module.exports = { reconcileStuckHousePayouts }
