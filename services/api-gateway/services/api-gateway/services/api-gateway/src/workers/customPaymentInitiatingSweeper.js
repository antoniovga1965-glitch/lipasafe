'use strict'
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const STUCK_THRESHOLD_MS = 10 * 60 * 1000
const SWEEP_INTERVAL_MS  = 5 * 60 * 1000

// Reverts Custom escrows stuck in PAYMENT_INITIATING — happens only if the server
// crashes/restarts between claiming the lock and getting an STK response. No money
// has left the buyer at this stage (STK push never reached/completed), so it's
// always safe to revert to ACCEPTED and let the buyer retry payment.
const sweepStuckInitiating = async () => {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  let stuck
  try {
    stuck = await prisma.customEscrow.findMany({
      where: {
        status: 'PAYMENT_INITIATING',
        updatedAt: { lte: cutoff },
      },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    })
  } catch (err) {
    logger.error('customPaymentInitiatingSweeper: DB query failed', { err: err.message })
    return
  }

  if (stuck.length === 0) return

  logger.warn(`customPaymentInitiatingSweeper: found ${stuck.length} stuck PAYMENT_INITIATING escrow(s)`, {
    ids: stuck.map(e => e.id),
  })

  for (const e of stuck) {
    try {
      const reverted = await prisma.customEscrow.updateMany({
        where: { id: e.id, status: 'PAYMENT_INITIATING' },
        data:  { status: 'ACCEPTED', mpesaCheckoutId: null },
      })
      if (reverted.count === 0) continue

      await prisma.customAuditLog.create({
        data: {
          escrowId: e.id,
          action: 'PAYMENT_INITIATING_SWEPT',
          meta: { note: 'Reverted to ACCEPTED — stuck in PAYMENT_INITIATING past threshold, no STK response ever recorded' },
        },
      })
      logger.warn('customPaymentInitiatingSweeper: reverted stuck escrow to ACCEPTED', { escrowId: e.id })
    } catch (err) {
      logger.error('customPaymentInitiatingSweeper: failed to revert escrow', { escrowId: e.id, err: err.message })
    }
  }
}

sweepStuckInitiating()
const interval = setInterval(sweepStuckInitiating, SWEEP_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('Custom payment-initiating sweeper started — sweeping every 5 minutes')
module.exports = { sweepStuckInitiating }
