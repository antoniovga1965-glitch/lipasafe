'use strict'
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const SWEEP_INTERVAL_MS = 5 * 60 * 1000

// Sweeps House escrows stuck at PENDING_ACCEPTANCE past their
// acceptanceDeadline — happens when a seller just never opens the link.
// No money has moved at this stage (payment only starts after acceptance),
// so it's always safe to mark EXPIRED and notify the buyer.
const sweepExpiredAcceptance = async () => {
  let stuck
  try {
    stuck = await prisma.houseEscrow.findMany({
      where: {
        status: 'PENDING_ACCEPTANCE',
        acceptanceDeadline: { lt: new Date() },
      },
      select: { id: true, buyerId: true, description: true },
      take: 50,
    })
  } catch (err) {
    logger.error('houseAcceptanceExpirySweeper: DB query failed', { err: err.message })
    return
  }

  if (stuck.length === 0) return
  logger.warn(`houseAcceptanceExpirySweeper: found ${stuck.length} expired PENDING_ACCEPTANCE escrow(s)`, {
    ids: stuck.map(e => e.id),
  })

  for (const e of stuck) {
    try {
      const updated = await prisma.houseEscrow.updateMany({
        where: { id: e.id, status: 'PENDING_ACCEPTANCE' },
        data:  { status: 'EXPIRED' },
      })
      if (updated.count === 0) continue // someone else already moved it — race-safe

      await prisma.houseAuditLog.create({
        data: {
          escrowId: e.id,
          action: 'ACCEPTANCE_EXPIRED',
          meta: { note: 'Seller never responded within acceptanceDeadline — auto-expired by sweeper' },
        },
      })

      try {
        const smsQueue = require('../queues/smsQueue')
        await smsQueue.add('buyer_notify_deal_response', {
          type: 'raw',
          phone: (await prisma.user.findUnique({ where: { id: e.buyerId }, select: { phone: true } }))?.phone,
          message: `LipaSafe: Your house deal request "${e.description}" expired — seller did not respond in time. Feel free to create a new request.`,
        })
      } catch (smsErr) {
        logger.error('houseAcceptanceExpirySweeper: buyer SMS failed', { escrowId: e.id, error: smsErr.message })
      }

      logger.warn('houseAcceptanceExpirySweeper: marked expired', { escrowId: e.id })
    } catch (err) {
      logger.error('houseAcceptanceExpirySweeper: failed to expire escrow', { escrowId: e.id, err: err.message })
    }
  }
}

sweepExpiredAcceptance()
const interval = setInterval(sweepExpiredAcceptance, SWEEP_INTERVAL_MS)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('House acceptance-expiry sweeper started — sweeping every 5 minutes')
module.exports = { sweepExpiredAcceptance }
