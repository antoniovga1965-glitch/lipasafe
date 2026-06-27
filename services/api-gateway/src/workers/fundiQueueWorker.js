'use strict'

const { Worker, Queue } = require('bullmq')
const prisma         = require('../utils/prisma')
const logger         = require('../utils/logger')
const { createAndSend } = require('../services/notificationService')
const { b2cPayout }  = require('../services/bundleService')
const redis           = require('../utils/redis')
const AfricasTalking = require('africastalking')

const at = AfricasTalking({
  apiKey:   process.env.SMS_API_KEY,
  username: process.env.AT_USERNAME,
})
const sms = at.SMS

// ── inline redis connection (same as b2cRetryWorker) ──────────────────────
const Decimal = require('decimal.js')
const toAmount = (v) => Number(new Decimal(v).toFixed(2))

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

// ── fundi queue (for scheduling delayed jobs) ────────────────────────────────
const fundiQueue = new Queue('fundi', { connection })

// ── money helpers ──────────────────────────────────────────────────────────
// const toCents   = (v) => Math.round(toAmount(v) * 100)
// const fromCents = (c) => (c / 100).toFixed(2)

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}

// ── SMS helper ─────────────────────────────────────────────────────────────
const sendSms = async (phone, message) => {
  const to        = '+' + normalizePhone(phone)
  const isSandbox = process.env.AT_ENVIRONMENT === 'sandbox'
  const opts      = { to: [to], message, from: isSandbox ? undefined : process.env.AT_SENDER_ID }
  const result    = await sms.send(opts)
  logger.info('AT SMS sent', { to, result: result.SMSMessageData })
  return result
}

// ── safe SMS wrapper (non-fatal for financial jobs) ──────────────────────────
const sendSmsSafe = async (phone, message) => {
  try {
    await sendSms(phone, message)
  } catch (err) {
    logger.error('SMS failed (non-fatal)', { phone, error: err.message })
  }
}

// ── worker ─────────────────────────────────────────────────────────────────
const fundiQueueWorker = new Worker('fundi', async (job) => {
  const { name, data } = job
  logger.info(`fundiQueue job started: ${name}`, { jobId: data.jobId })

  switch (name) {

    // ── 1. send_acceptance_sms ───────────────────────────────────────────
    // Sends OTP + job details to fundi so they can accept via SMS or in-app
    case 'send_acceptance_sms': {
      const { fundiPhone, amount, otp, expiresAt, jobId: smsJobId } = data
      const expiryStr = new Date(expiresAt).toLocaleTimeString('en-KE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi',
      })

      // Fetch category + deliverables from DB — avoids threading more queue fields
      const jobRecord = smsJobId
        ? await prisma.fundiJob.findUnique({
            where:  { id: smsJobId },
            select: { category: true, deliverables: true, description: true },
          })
        : null

      const categoryLine = jobRecord?.category ? `Aina: ${jobRecord.category}. ` : ''
      const delivLines   = (jobRecord?.deliverables || []).length > 0
        ? `Lazima: ${jobRecord.deliverables.slice(0, 3).join(', ')}${jobRecord.deliverables.length > 3 ? '...' : ''}. `
        : ''

      const message =
        `LipaSafe: Kazi imepokelewa. ${categoryLine}KES ${amount} imehifadhiwa. ` +
        `${delivLines}` +
        `OTP yako: ${otp} (inaisha ${expiryStr}). ` +
        `Reply SMS: ACCEPT ${otp} — au kubali kwenye app.`
      await sendSms(fundiPhone, message)
      logger.info('send_acceptance_sms done', { fundiPhone, jobId: data.jobId })
      // notify buyer
      if (data.buyerId) {
        await createAndSend({ userId: data.buyerId, type: 'payment_received', transactionId: null,
          messageEn: `Your payment is held in escrow. Waiting for fundi to accept the job.`,
          messageSw: `Malipo yako yamehifadhiwa. Tunangoja fundi akubali kazi.` })
      }
      break
    }

    // ── 2. send_raw_sms ─────────────────────────────────────────────────
    // Generic SMS — dispute notifications, buyer confirmations, etc.
    case 'send_raw_sms': {
      const { phone, message } = data
      await sendSms(phone, message)
      logger.info('send_raw_sms done', { phone })
      break
    }

    // ── 3. notify_buyer_review ───────────────────────────────────────────
    // Tells buyer that fundi submitted work and they have N hours to review
    case 'notify_buyer_review': {
      const { jobId, buyerId, deadlineAt } = data
      const buyer = await prisma.user.findUnique({
        where:  { id: buyerId },
        select: { phone: true },
      })
      if (!buyer) {
        logger.warn('notify_buyer_review: buyer not found', { buyerId, jobId })
        break
      }
      const deadlineStr = new Date(deadlineAt).toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi', dateStyle: 'short', timeStyle: 'short',
      })
      const message =
        `LipaSafe: Fundi amekamilisha kazi ${jobId.slice(0,8).toUpperCase()}. ` +
        `Approve au dispute kabla ya ${deadlineStr}. Fungua app kukagua.`
      await sendSms(buyer.phone, message)
      logger.info('notify_buyer_review done', { jobId, buyerId })
      await createAndSend({ userId: buyerId, type: 'confirm_delivery', transactionId: null,
        messageEn: `Fundi has marked the job done. Review and approve or dispute before the inspection deadline.`,
        messageSw: `Fundi amekamilisha kazi. Kagua na approve au dispute kabla ya muda kuisha.` })
      break
    }

    // ── 4. expire_unaccepted ─────────────────────────────────────────────
    // Fires after 24h if fundi never accepted — cancel job + refund buyer
    case 'expire_unaccepted': {
      const { jobId, buyerId, amount } = data

      // Atomic: only cancel if still waiting
      const updated = await prisma.fundiJob.updateMany({
        where: { id: jobId, status: 'WAITING_FOR_FUNDI_ACCEPTANCE' },
        data:  { status: 'CANCELLED' },
      })

      if (updated.count === 0) {
        logger.info('expire_unaccepted: job already progressed', { jobId })
        break
      }

      // Policy: never refund the service fee — refund principal only
      const job = await prisma.fundiJob.findUnique({
        where:  { id: jobId },
        select: { amount: true },
      })
      const refundAmount = job?.amount ?? amount

      // Idempotent B2C refund to buyer
      const buyer = await prisma.user.findUnique({
        where:  { id: buyerId },
        select: { phone: true },
      })
      if (!buyer) {
        logger.error('expire_unaccepted: buyer not found', { buyerId, jobId })
        break
      }
      await b2cPayout(buyer.phone, toAmount(refundAmount), `expire_refund_${jobId}`)

      // Mark escrow refunded only after payout succeeds
      await prisma.fundiEscrow.updateMany({
        where: { jobId, status: { not: 'refunded' } },
        data:  { status: 'refunded', refundedAt: new Date() },
      })

      // Notify buyer
      const message =
        `LipaSafe: Fundi hakukubali kazi ${jobId.slice(0,8).toUpperCase()} ndani ya masaa 24. ` +
        `Refund ya KES ${refundAmount} imetumwa.`
      await sendSmsSafe(buyer.phone, message)

      logger.info('expire_unaccepted: job cancelled, refund queued', { jobId, refundAmount })
      break
    }

    // ── 5. check_deadline ────────────────────────────────────────────────
    // Fires when job timer runs out — mark OVERDUE if still ACTIVE
    case 'check_deadline': {
      const { jobId } = data

      const updated = await prisma.fundiJob.updateMany({
        where: { id: jobId, status: 'ACTIVE' },
        data:  { status: 'OVERDUE' },
      })

      if (updated.count === 0) {
        logger.info('check_deadline: job not ACTIVE, skipping', { jobId })
        break
      }

      // Notify both parties
      const job = await prisma.fundiJob.findUnique({
        where:  { id: jobId },
        select: { id: true, fundiPhone: true, buyerId: true },
      })
      if (!job) break

      const buyer = await prisma.user.findUnique({
        where:  { id: job.buyerId },
        select: { phone: true },
      })
      const ref = jobId.slice(0,8).toUpperCase()

      await sendSmsSafe(job.fundiPhone,
        `LipaSafe: Muda wa kazi ${ref} umeisha. Tuma picha za baada au omba extension.`)
      if (buyer) {
        await sendSmsSafe(buyer.phone,
          `LipaSafe: Fundi hajakamilisha kazi ${ref} kwa wakati. Unaweza extend au dispute.`)
      }

      await fundiQueue.add('overdue_timeout', { jobId }, {
        delay: 72 * 60 * 60 * 1000,
        jobId: `overdue_timeout_${jobId}`,
      })
      logger.info('check_deadline: job marked OVERDUE, overdue_timeout scheduled 72h', { jobId })
      if (buyer) {
        await createAndSend({ userId: job.buyerId, type: 'deliver_now', transactionId: null,
          messageEn: `Your fundi job is overdue. The fundi has not completed the work on time. You can extend or dispute.`,
          messageSw: `Kazi ya fundi imechelewa. Fundi hakukamilisha kwa wakati. Unaweza extend au dispute.` })
      }
      break
    }

    // ── 6. auto_release ──────────────────────────────────────────────────
    // Fires after inspection window if buyer neither approved nor disputed
    case 'auto_release': {
      const { jobId } = data

      // Atomic: only release if still awaiting review
      const updated = await prisma.fundiJob.updateMany({
        where: { id: jobId, status: 'AWAITING_BUYER_REVIEW' },
        data:  { status: 'COMPLETED' },
      })

      if (updated.count === 0) {
        logger.info('auto_release: job already actioned by buyer', { jobId })
        break
      }

      const job = await prisma.fundiJob.findUnique({
        where:  { id: jobId },
        select: { fundiPhone: true, amount: true, buyerId: true },
      })
      if (!job) break

      // B2C payout to fundi (deduped) — must succeed before escrow is marked released
      await b2cPayout(job.fundiPhone, toAmount(job.amount), `auto_release_${jobId}`)

      // Mark escrow released only after payout succeeds
      await prisma.fundiEscrow.updateMany({
        where: { jobId, status: { not: 'released' } },
        data:  { status: 'released', releasedAt: new Date() },
      })

      // Notify fundi
      await sendSmsSafe(job.fundiPhone,
        `LipaSafe: Kazi ${jobId.slice(0,8).toUpperCase()} imekubaliwa auto. ` +
        `KES ${job.amount} inatolewa kwako.`)

      // Notify buyer
      const buyer = await prisma.user.findUnique({
        where:  { id: job.buyerId },
        select: { phone: true },
      })
      if (buyer) {
        await sendSmsSafe(buyer.phone,
          `LipaSafe: Kazi ${jobId.slice(0,8).toUpperCase()} ilifungwa auto baada ya review window. ` +
          `Malipo yametumwa kwa fundi.`)
      }

      logger.info('auto_release: funds released to fundi', { jobId, amount: job.amount })
      if (buyer) {
        await createAndSend({ userId: job.buyerId, type: 'money_released', transactionId: null,
          messageEn: `Job completed. KES ${job.amount} has been released to the fundi.`,
          messageSw: `Kazi imekamilika. KES ${job.amount} imetumwa kwa fundi.` })
      }
      break
    }

    // ── 7. payout_fundi ──────────────────────────────────────────────────
    // Direct B2C payout after buyer approval or admin FULL_RELEASE/PARTIAL
    case 'payout_fundi': {
      const { jobId, fundiPhone, amount } = data
      const result = await b2cPayout(fundiPhone, toAmount(amount), `payout_fundi_${jobId}`)
      const originatorId = result?.OriginatorConversationID
      if (originatorId) {
        await redis.set(`fundi:b2c:originator:${originatorId}`, JSON.stringify({ jobId, type: 'payout' }), 'EX', 86400)
      }
      logger.info('payout_fundi done', { jobId, fundiPhone, amount, originatorId })
      break
    }

    // ── 8. refund_buyer ──────────────────────────────────────────────────
    // B2C refund to buyer after cancellation or admin FULL_REFUND/PARTIAL
    case 'refund_buyer': {
      const { jobId, buyerId, amount } = data
      const buyer = await prisma.user.findUnique({
        where:  { id: buyerId },
        select: { phone: true },
      })
      if (!buyer) {
        logger.error('refund_buyer: buyer not found', { buyerId, jobId })
        throw new Error(`Buyer ${buyerId} not found — will retry`)
      }
      await b2cPayout(buyer.phone, toAmount(amount), `refund_buyer_${jobId}`)
      logger.info('refund_buyer done', { jobId, buyerId, amount })
      await createAndSend({ userId: buyerId, type: 'refund_sent', transactionId: null,
        messageEn: `Your refund of KES ${amount} has been sent to your M-Pesa.`,
        messageSw: `Refund ya KES ${amount} imetumwa kwenye M-Pesa yako.` })
      break
    }

    // ── 9. overdue_timeout ──────────────────────────────────────────────────
    // Fires 72h after OVERDUE — auto-refund buyer if still stuck
    case 'overdue_timeout': {
      const { jobId } = data

      const updated = await prisma.fundiJob.updateMany({
        where: { id: jobId, status: 'OVERDUE' },
        data:  { status: 'CANCELLED' },
      })
      if (updated.count === 0) {
        logger.info('overdue_timeout: job already resolved', { jobId })
        break
      }

      await prisma.fundiEscrow.updateMany({
        where: { jobId, status: { not: 'refunded' } },
        data:  { status: 'refunded', refundedAt: new Date() },
      })

      const job = await prisma.fundiJob.findUnique({
        where:  { id: jobId },
        select: { amount: true, buyerId: true },
      })
      if (!job) break

      const buyer = await prisma.user.findUnique({
        where:  { id: job.buyerId },
        select: { phone: true },
      })
      if (!buyer) { logger.error('overdue_timeout: buyer not found', { jobId }); break }

      await b2cPayout(buyer.phone, toAmount(job.amount), `overdue_refund_${jobId}`)
      await sendSmsSafe(buyer.phone,
        `LipaSafe: Kazi ${jobId.slice(0,8).toUpperCase()} ilifungwa baada ya fundi kutokamilisha. ` +
        `Refund ya KES ${job.amount} imetumwa.`)
      await createAndSend({ userId: job.buyerId, type: 'refund_sent', transactionId: null,
        messageEn: `Job cancelled — fundi did not complete. Refund of KES ${job.amount} sent to your M-Pesa.`,
        messageSw: `Kazi imefutwa. Refund ya KES ${job.amount} imetumwa kwenye M-Pesa yako.` })

      logger.info('overdue_timeout: buyer refunded', { jobId, amount: job.amount })
      break
    }

    default:
      logger.warn(`fundiQueue: unknown job type "${name}"`, { data })
  }

}, { connection, concurrency: 5 })

// ── event hooks ────────────────────────────────────────────────────────────
fundiQueueWorker.on('completed', (job) => {
  logger.info(`fundiQueue job completed: ${job.name}`, { jobId: job.data?.jobId })
})

fundiQueueWorker.on('failed', (job, err) => {
  logger.error(`fundiQueue job FAILED: ${job?.name}`, {
    jobId:  job?.data?.jobId,
    error:  err.message,
    stack:  err.stack,
  })
})

fundiQueueWorker.on('error', (err) => {
  logger.error('fundiQueueWorker error', { error: err.message })
})

module.exports = fundiQueueWorker