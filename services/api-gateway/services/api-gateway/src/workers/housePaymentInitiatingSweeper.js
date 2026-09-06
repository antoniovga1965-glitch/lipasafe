'use strict'
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const STUCK_THRESHOLD_MS = 10 * 60 * 1000
const SWEEP_INTERVAL_MS  = 5 * 60 * 1000

// Reverts House escrows stuck in PAYMENT_INITIATING — happens if the server
// crashes/restarts between claiming the lock and getting an STK response, or
// the buyer simply abandons the M-Pesa prompt. No money has left the buyer
// at this stage, so it's always safe to revert to PENDING_PAYMENT and let
// the buyer retry payment from the app.
const sweepStuckInitiating = async () => {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  let stuck
  try {
    stuck = await prisma.houseEscrow.findMany({
      where: {
        status: 'PAYMENT_INITIATING',
        updatedAt: { lte: cutoff },
      },
      select: { id: true, updatedAt: true },
      take: 50,
    })
  } catch (err) {
    logger.error('housePaymentInitiatingSweeper: DB query failed', { err: err.message })
    return
  }

  if (stuck.length === 0) return

  logger.warn(`housePaymentInitiatingSweeper: found ${stuck.length} stuck PAYMENT_INITIATING escrow(s)`, {
    ids: stuck.map(e => e.id),
  })

  for (const e of stuck) {
    try {
      const reverted = await prisma.houseEscrow.updateMany({
        where: { id: e.id, status: 'PAYMENT_INITIATING' },
        data:  { status: 'PENDING_PAYMENT', mpesaCheckoutId: null },
      })
      if (reverted.count === 0) continue

      await prisma.houseAuditLog.create({
        data: {
          escrowId: e.id,
          action: 'PAYMENT_INITIATING_SWEPT',
          meta: { note: 'Reverted to PENDING_PAYMENT — stuck in PAYMENT_INITIATING past threshold, no STK response ever recorded' },
        },
      })
      logger.warn('housePaymentInitiatingSweeper: reverted stuck escrow to PENDING_PAYMENT', { escrowId: e.id })
    } catch (err) {
      logger.error('housePaymentInitiatingSweeper: failed to revert escrow', { escrowId: e.id, err: err.message })
    }
  }
}

sweepStuckInitiating()
const interval = setInterval(sweepStuckInitiating, SWEEP_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('House payment-initiating sweeper started — sweeping every 5 minutes')
module.exports = { sweepStuckInitiating }
