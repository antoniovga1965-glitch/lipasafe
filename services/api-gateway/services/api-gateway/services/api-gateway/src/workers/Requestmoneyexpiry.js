'use strict'

const { Worker } = require('bullmq')
const prisma     = require('../utils/prisma')
const logger     = require('../utils/logger')
const smsQueue   = require('../queues/smsQueue')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

const PURPOSE_LABELS = {
  RENT:        'Rent',
  SALARY:      'Salary',
  SCHOOL_FEES: 'School Fees',
  PURCHASE:    'Purchase',
  LOAN:        'Loan Repayment',
  GIFT:        'Gift',
  OTHER:       'Other',
}

const normalizePhone = (phone) => {
  if (!phone) return ''
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0'))   return '254' + p.slice(1)
  if (p.startsWith('+'))   return p.slice(1)
  return p
}

const requestMoneyExpiryWorker = new Worker(
  'request-money',
  async (job) => {
    if (job.name !== 'expire') return

    const { requestId } = job.data
    logger.info('requestMoney expiry: processing', { requestId })

    const request = await prisma.requestMoney.findUnique({
      where:   { id: requestId },
      include: { requester: { select: { fullName: true, phone: true } } },
    })

    if (!request) {
      logger.warn('requestMoney expiry: request not found', { requestId })
      return
    }

    if (request.state !== 'PENDING') {
      // Already paid, rejected or cancelled — nothing to do, no money moved
      logger.info('requestMoney expiry: already resolved, skipping', {
        requestId,
        state: request.state,
      })
      return
    }

    // ── Atomic PENDING → EXPIRED ──────────────────────────────────────────────
    // Guards against a race where the recipient pays at the exact moment of expiry.
    const updated = await prisma.requestMoney.updateMany({
      where: { id: requestId, state: 'PENDING' },
      data:  { state: 'EXPIRED' },
    })

    if (updated.count === 0) {
      logger.info('requestMoney expiry: race caught — already processed', { requestId })
      return
    }

    logger.info('requestMoney expired', { requestId })

    const purposeLabel  = PURPOSE_LABELS[request.purpose] || request.purpose
    const requesterPhone = normalizePhone(request.requester.phone)

    // Resolve recipient display name if they're registered
    const recipientUser = await prisma.user.findUnique({
      where:  { phone: request.recipientPhone },
      select: { fullName: true },
    }).catch(() => null)

    const recipientName = recipientUser?.fullName || request.recipientPhone

    // ── SMS requester ─────────────────────────────────────────────────────────
    await smsQueue.add('request_expired_sms_requester', {
      type:    'raw',
      phone:   requesterPhone,
      message: `Your KES ${Number(request.amount)} request to ${recipientName} for ${purposeLabel} has expired. Nobody paid. You can send a new request anytime.`,
    })
  },
  { connection }
)

requestMoneyExpiryWorker.on('completed', (job) => {
  logger.info('requestMoney expiry job completed', { jobId: job.id })
})

requestMoneyExpiryWorker.on('failed', (job, err) => {
  logger.error('requestMoney expiry job failed', { jobId: job?.id, err: err.message })
})

module.exports = requestMoneyExpiryWorker