'use strict'
const prisma   = require('../utils/prisma')
const logger   = require('../utils/logger')
const smsQueue = require('../queues/smsQueue')

const ADMIN_PHONE   = process.env.ADMIN_PHONE
const SLA_HOURS     = parseInt(process.env.DISPUTE_SLA_HOURS || '4')
const SLA_MS        = SLA_HOURS * 60 * 60 * 1000

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  throw new Error(`Invalid phone: ${phone}`)
}

const runSlaCheck = async () => {
  try {
    const cutoff = new Date(Date.now() - SLA_MS)

    // Find disputes breaching SLA — OPEN or PENDING_ADMIN older than SLA_HOURS
    const breaching = await prisma.deliveryDispute.findMany({
      where: {
        status:    { in: ['OPEN', 'PENDING_ADMIN'] },
        createdAt: { lt: cutoff },
      },
      include: {
        order: { select: { id: true, goods: true, amount: true } },
      },
    })

    if (breaching.length === 0) {
      logger.info('Dispute SLA check — no breaches', { checkedAt: new Date() })
      return
    }

    logger.warn('Dispute SLA breaches found', { count: breaching.length })

    for (const dispute of breaching) {
      // Escalate status
      await prisma.deliveryDispute.update({
        where: { id: dispute.id },
        data:  { status: 'ESCALATED' },
      })

      // Log to timeline
      await prisma.deliveryTimeline.create({
        data: {
          orderId:   dispute.orderId,
          event:     'DISPUTE_SLA_BREACHED',
          actor:     'SYSTEM',
          details:   JSON.stringify({ disputeId: dispute.id, slaHours: SLA_HOURS }),
          timestamp: new Date(),
        },
      })

      // Notify admin
      if (ADMIN_PHONE) {
        await smsQueue.add('send-sms', {
          to:      normalizePhone(ADMIN_PHONE),
          message: `LIPASAFE URGENT: Dispute ${dispute.id.slice(0,8).toUpperCase()} for "${dispute.order.goods}" has exceeded ${SLA_HOURS}hr SLA. KES ${dispute.order.amount}. Resolve immediately.`,
        }, { jobId: `sla-breach-${dispute.id}` })
      }

      logger.warn('Dispute escalated — SLA breached', {
        disputeId: dispute.id,
        orderId:   dispute.orderId,
        age:       `${SLA_HOURS}h+`,
      })
    }
  } catch (err) {

    console.error(err)
    logger.error('disputeSlaWorker error', { err: err.message })
  }
}

// Run every 30 minutes
const START_DELAY = 60 * 1000
setTimeout(() => {
  runSlaCheck()
  setInterval(runSlaCheck, 30 * 60 * 1000)
}, START_DELAY)

logger.info('Dispute SLA worker started', { slaHours: SLA_HOURS, checkInterval: '30min' })

module.exports = { runSlaCheck }
