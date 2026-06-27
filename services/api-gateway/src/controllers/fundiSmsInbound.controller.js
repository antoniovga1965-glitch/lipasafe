'use strict'
const crypto  = require('crypto')
const prisma  = require('../utils/prisma')
const logger  = require('../utils/logger')
const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}
const fundiQueue         = require('../queues/fundiQueue')

const MAX_OTP_ATTEMPTS = 3

const handleFundiInboundSMS = async (req, res) => {
  
  res.status(200).send()

  try {
    const from = normalizePhone((req.body.from || '').toString().trim())
    const text = (req.body.text || '').toString().trim().toUpperCase()
    const messageId = (req.body.id || '').toString().trim()

    logger.info('Fundi inbound SMS', { from, text })

    // ── Idempotency — ignore duplicate AT retries ──
    if (messageId) {
      const dedupKey = `fundi:sms:inbound:${messageId}`
      const seen = await require('../utils/redis').get(dedupKey)
      if (seen) {
        logger.info('Duplicate fundi SMS ignored', { messageId })
        return
      }
      await require('../utils/redis').setex(dedupKey, 86400, '1')
    }

    // ── ACCEPT <OTP> ──
    const acceptMatch = text.match(/^ACCEPT\s+(\d{4,6})$/)
    if (acceptMatch) {
      await handleAccept(from, acceptMatch[1])
      return
    }

    // ── ACCEPT with no OTP ──
    if (text === 'ACCEPT') {
      await fundiQueue.add('send_raw_sms', {
        phone:   from,
        message: 'LipaSafe: Invalid format. Reply: ACCEPT 1234',
      })
      return
    }

    // ── Unknown ──
    await fundiQueue.add('send_raw_sms', {
      phone:   from,
      message: 'LipaSafe: To accept a job, reply: ACCEPT <code>. E.g. ACCEPT 1234',
    })

  } catch (err) {
    logger.error('handleFundiInboundSMS failed', { error: err.message, stack: err.stack })
  }
}

const handleAccept = async (fundiPhone, otp) => {
  // Find latest job waiting for this fundi
  const job = await prisma.fundiJob.findFirst({
    where: {
      fundiPhone,
      status: 'WAITING_FOR_FUNDI_ACCEPTANCE',
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!job) {
    await fundiQueue.add('send_raw_sms', {
      phone:   fundiPhone,
      message: 'LipaSafe: No pending job found for your number.',
    })
    return
  }

  // Audit log this reply
  await prisma.fundiSmsReply.create({
    data: { jobId: job.id, phone: fundiPhone, message: `ACCEPT ${otp}`, processed: false },
  })

  // ── OTP locked? ──
  if (job.otpLockedAt) {
    await fundiQueue.add('send_raw_sms', {
      phone:   fundiPhone,
      message: 'LipaSafe: Too many wrong attempts. Ask buyer to resend invitation.',
    })
    await updateReplyResult(job.id, fundiPhone, 'locked')
    return
  }

  // ── OTP expired? ──
  if (!job.otpExpiresAt || new Date() > job.otpExpiresAt) {
    await fundiQueue.add('send_raw_sms', {
      phone:   fundiPhone,
      message: 'LipaSafe: OTP expired. Ask buyer to resend invitation.',
    })
    await updateReplyResult(job.id, fundiPhone, 'expired')
    return
  }

  // ── Verify OTP ──
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex')

  if (otpHash !== job.otpHash) {
    const newAttempts = job.otpFailedAttempts + 1
    const lockNow     = newAttempts >= MAX_OTP_ATTEMPTS

    await prisma.fundiJob.update({
      where: { id: job.id },
      data: {
        otpFailedAttempts: newAttempts,
        otpLockedAt:       lockNow ? new Date() : undefined,
      },
    })

    const msg = lockNow
      ? 'LipaSafe: Too many wrong attempts. Ask buyer to resend invitation.'
      : `LipaSafe: Incorrect OTP. ${MAX_OTP_ATTEMPTS - newAttempts} attempt(s) remaining.`

    await fundiQueue.add('send_raw_sms', { phone: fundiPhone, message: msg })
    await updateReplyResult(job.id, fundiPhone, lockNow ? 'locked' : 'wrong_otp')
    return
  }

  // ── Already accepted? ──
  if (job.status !== 'WAITING_FOR_FUNDI_ACCEPTANCE') {
    await fundiQueue.add('send_raw_sms', {
      phone:   fundiPhone,
      message: 'LipaSafe: Job already accepted. No action needed.',
    })
    await updateReplyResult(job.id, fundiPhone, 'already_accepted')
    return
  }

  // ── Accept job ──
  const acceptedAt = new Date()
  const deadlineAt = new Date(acceptedAt.getTime() + job.durationHours * 60 * 60 * 1000)

  await prisma.fundiJob.update({
    where: { id: job.id },
    data: {
      status:      'ACTIVE',
      acceptedAt,
      deadlineAt,
      otpHash:     null,
      otpExpiresAt: null,
    },
  })

  await updateReplyResult(job.id, fundiPhone, 'accepted')

  // Notify fundi
  await fundiQueue.add('send_raw_sms', {
    phone:   fundiPhone,
    message: `LipaSafe: Job accepted! KES ${job.amount}. Deadline: ${deadlineAt.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}. Upload photos and click DONE when complete.`,
  })

  // Schedule deadline check
  await fundiQueue.add('check_deadline', { jobId: job.id }, {
    delay:    job.durationHours * 60 * 60 * 1000,
    jobId:    `deadline_${job.id}`,
  })

  logger.info('Fundi job accepted via SMS', { jobId: job.id, fundiPhone })
  await createAndSend({ userId: job.buyerId, type: 'payment_received', transactionId: job.id,
    messageEn: `Fundi accepted your job. Work has started — ${job.durationHours}h on the clock.`,
    messageSw: `Fundi amekubali kazi. Kazi imeanza — saa ${job.durationHours} zinaendelea.` })
}

const updateReplyResult = async (jobId, phone, result) => {
  await prisma.fundiSmsReply.updateMany({
    where: { jobId, phone, processed: false },
    data:  { processed: true, result },
  })
}

module.exports = { handleFundiInboundSMS }
