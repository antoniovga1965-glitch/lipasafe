'use strict'

const Decimal            = require('decimal.js')
const prisma             = require('../utils/prisma')
const logger             = require('../utils/logger')
const { createAndSend }  = require('../services/notificationService')
const { initiateSTK }    = require('../utils/Mpesastk')
const smsQueue           = require('../queues/smsQueue')
const requestMoneyQueue  = require('../queues/Requestmoneyqueue')

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPIRY_MS = 24 * 60 * 60 * 1_000   // 24 hours
const PLATFORM_RATE = new Decimal('0.02') // 2 %

const PURPOSE_LABELS = {
  RENT:        'Rent',
  SALARY:      'Salary',
  SCHOOL_FEES: 'School Fees',
  PURCHASE:    'Purchase',
  LOAN:        'Loan Repayment',
  GIFT:        'Gift',
  OTHER:       'Other',
}

const VALID_PURPOSES = Object.keys(PURPOSE_LABELS)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizePhone = (phone) => {
  if (!phone) return ''
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0'))   return '254' + p.slice(1)
  if (p.startsWith('+'))   return p.slice(1)
  return p
}

/**
 * Fee calc that matches the frontend (ReceiveScreen.js):
 *   recipientPays = amount + 2% (platform fee, ceiled to whole KES)
 *   B2C charge is absorbed by the platform from its fee.
 */
const calcRequestFees = (requestedAmount) => {
  const amount      = new Decimal(requestedAmount)
  const rawFee      = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const rawTotal    = amount.plus(rawFee)
  const recipientPays = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee   = recipientPays.minus(amount)           // absorbs rounding
  return { amount, platformFee, recipientPays }
}

const removeExpiryJob = async (requestId) => {
  try {
    const job = await requestMoneyQueue.getJob(`expire-${requestId}`)
    if (job) await job.remove()
  } catch (err) {
    logger.warn('removeExpiryJob: failed to remove', { requestId, err: err.message })
  }
}

// ─── POST /request/create ─────────────────────────────────────────────────────

const createRequest = async (req, res) => {
  const { recipientPhone, amount, purpose, note } = req.body
  const requesterId = req.user.id

  try {
    // ── Validate ──────────────────────────────────────────────────────────────
    if (!recipientPhone || !amount || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'recipientPhone, amount, and purpose are required',
      })
    }
    if (Number(amount) < 10) {
      return res.status(400).json({ success: false, message: 'Minimum request amount is KES 10' })
    }
    if (!VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({ success: false, message: 'Invalid purpose' })
    }

    const requester = await prisma.user.findUnique({ where: { id: requesterId } })
    if (!requester) return res.status(404).json({ success: false, message: 'User not found' })

    const normalizedRecipient = normalizePhone(recipientPhone)
    if (normalizePhone(requester.phone) === normalizedRecipient) {
      return res.status(400).json({ success: false, message: 'Cannot request money from yourself' })
    }

    // ── Fees ──────────────────────────────────────────────────────────────────
    const fees = calcRequestFees(amount)

    // ── Check if recipient has a LipaSafe account ─────────────────────────────
    const recipient = await prisma.user.findUnique({ where: { phone: normalizedRecipient } })

    // ── Create DB record ──────────────────────────────────────────────────────
    const expiresAt = new Date(Date.now() + EXPIRY_MS)

    const request = await prisma.requestMoney.create({
      data: {
        requesterId,
        recipientPhone:  normalizedRecipient,
        recipientId:     recipient?.id ?? null,
        amount:          fees.amount.toNumber(),
        platformFee:     fees.platformFee.toNumber(),
        recipientPays:   fees.recipientPays.toNumber(),
        purpose,
        note:            note?.trim() || null,
        state:           'PENDING',
        expiresAt,
      },
    })

    // ── Schedule BullMQ expiry job ────────────────────────────────────────────
    await requestMoneyQueue.add(
      'expire',
      { requestId: request.id },
      { delay: EXPIRY_MS, jobId: `expire-${request.id}` }
    )

    // ── Build message strings ─────────────────────────────────────────────────
    const purposeLabel = PURPOSE_LABELS[purpose]
    const noteStr      = note?.trim() ? ` — ${note.trim()}` : ''
    const requestLink  = `${process.env.APP_BASE_URL || 'https://lipasafe.com'}/request/${request.id}`

    const recipientMsg =
      `${requester.fullName} is requesting KES ${fees.recipientPays.toNumber()} from you` +
      ` for ${purposeLabel}${noteStr}. Tap to pay or reject: ${requestLink}`

    // ── SMS recipient (registered or not) ────────────────────────────────────
    await smsQueue.add('request_money_sms_recipient', {
      type:    'raw',
      phone:   normalizedRecipient,
      message: recipientMsg,
    })

    // ── Push notification to recipient if they're on LipaSafe ────────────────
    if (recipient) {
      createAndSend({
        userId:    recipient.id,
        type:      'money_request_received',
        requestId: request.id,
        messageEn: recipientMsg,
        channel:   'push',
      }).catch(err => logger.warn('createRequest: push to recipient failed', { err: err.message }))
    }

    return res.status(201).json({
      success: true,
      request: {
        id:           request.id,
        amount:       request.amount,
        recipientPays: request.recipientPays,
        platformFee:  request.platformFee,
        purpose:      request.purpose,
        state:        request.state,
        expiresAt:    request.expiresAt,
      },
    })
  } catch (err) {
    logger.error('createRequest error', { err: err.message, requesterId })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ─── POST /request/:id/pay ────────────────────────────────────────────────────
// Recipient triggers STK push to their own phone.
// Race condition guard: checkoutRequestId uniqueness + PENDING check in callback.

const payRequest = async (req, res) => {
  const { id }      = req.params
  const callerPhone = normalizePhone(req.user.phone)

  try {
    const request = await prisma.requestMoney.findUnique({
      where:   { id },
      include: { requester: { select: { fullName: true, phone: true } } },
    })

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' })
    }
    if (request.state !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Request is already ${request.state.toLowerCase()}`,
      })
    }
    if (normalizePhone(request.recipientPhone) !== callerPhone) {
      return res.status(403).json({ success: false, message: 'You are not the recipient of this request' })
    }
    if (new Date() > request.expiresAt) {
      return res.status(400).json({ success: false, message: 'This request has expired' })
    }
    // Prevent double-tap: if STK already initiated, tell user to check phone
    if (request.checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Payment already initiated. Check your phone for the M-Pesa PIN prompt.',
      })
    }

    const purposeLabel = PURPOSE_LABELS[request.purpose] || request.purpose

    // ── Initiate STK push ─────────────────────────────────────────────────────
    const stkResult = await initiateSTK({
      phone:       callerPhone,
      amount:      Number(request.recipientPays),
      accountRef:  `REQ${request.id.slice(0, 9).toUpperCase()}`,
      description: `${purposeLabel} pay`,
      callbackURL: process.env.MPESA_REQUEST_MONEY_STK_CALLBACK_URL,
    })

    // Store checkoutRequestId so the callback can find this request
    await prisma.requestMoney.update({
      where: { id },
      data:  { checkoutRequestId: stkResult.CheckoutRequestID },
    })

    return res.json({
      success:           true,
      message:           'M-Pesa prompt sent to your phone. Enter your PIN to complete payment.',
      checkoutRequestId: stkResult.CheckoutRequestID,
    })
  } catch (err) {
    logger.error('payRequest error', { err: err.message, requestId: id })
    return res.status(500).json({ success: false, message: 'Failed to initiate payment. Try again.' })
  }
}

// ─── POST /request/:id/reject ─────────────────────────────────────────────────

const rejectRequest = async (req, res) => {
  const { id }      = req.params
  const callerPhone = normalizePhone(req.user.phone)

  try {
    const request = await prisma.requestMoney.findUnique({
      where:   { id },
      include: { requester: { select: { id: true, fullName: true, phone: true } } },
    })

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' })
    }
    if (request.state !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Request is already ${request.state.toLowerCase()}` })
    }
    if (normalizePhone(request.recipientPhone) !== callerPhone) {
      return res.status(403).json({ success: false, message: 'You are not the recipient of this request' })
    }

    // ── Atomic state transition — updateMany guards against race ──────────────
    const updated = await prisma.requestMoney.updateMany({
      where: { id, state: 'PENDING' },
      data:  { state: 'REJECTED' },
    })

    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: 'Request was already processed' })
    }

    await removeExpiryJob(id)

    const purposeLabel    = PURPOSE_LABELS[request.purpose] || request.purpose
    const recipientName   = req.user.fullName || 'Recipient'
    const requesterPhone  = normalizePhone(request.requester.phone)

    // ── SMS requester ─────────────────────────────────────────────────────────
    await smsQueue.add('request_rejected_sms_requester', {
      type:    'raw',
      phone:   requesterPhone,
      message: `${recipientName} rejected your KES ${Number(request.amount)} request for ${purposeLabel}. No money was moved.`,
    })

    // ── Push notification to requester ────────────────────────────────────────
    createAndSend({
      userId:    request.requester.id,
      type:      'REQUEST_REJECTED',
      messageEn: `${recipientName} rejected your KES ${Number(request.amount)} request for ${purposeLabel}. No money was moved.`,
      channel:   'push',
    }).catch(err => logger.warn('rejectRequest: push to requester failed', { err: err.message }))

    return res.json({ success: true, message: 'Request rejected.' })
  } catch (err) {
    logger.error('rejectRequest error', { err: err.message, requestId: id })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ─── POST /request/:id/cancel ─────────────────────────────────────────────────

const cancelRequest = async (req, res) => {
  const { id }     = req.params
  const callerId   = req.user.id

  try {
    const request = await prisma.requestMoney.findUnique({
      where:   { id },
      include: { requester: { select: { fullName: true } } },
    })

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' })
    }
    if (request.state !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Request is already ${request.state.toLowerCase()}` })
    }
    if (request.requesterId !== callerId) {
      return res.status(403).json({ success: false, message: 'Only the requester can cancel' })
    }

    // ── Atomic state transition ───────────────────────────────────────────────
    const updated = await prisma.requestMoney.updateMany({
      where: { id, state: 'PENDING' },
      data:  { state: 'CANCELLED' },
    })

    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: 'Request was already processed' })
    }

    await removeExpiryJob(id)

    const purposeLabel = PURPOSE_LABELS[request.purpose] || request.purpose

    // ── SMS recipient so they know to ignore the earlier SMS ──────────────────
    await smsQueue.add('request_cancelled_sms_recipient', {
      type:    'raw',
      phone:   request.recipientPhone,
      message: `${request.requester.fullName} cancelled their KES ${Number(request.amount)} request for ${purposeLabel}. Ignore the previous message.`,
    })

    return res.json({ success: true, message: 'Request cancelled.' })
  } catch (err) {
    logger.error('cancelRequest error', { err: err.message, requestId: id })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ─── GET /request/:id ─────────────────────────────────────────────────────────

const getRequest = async (req, res) => {
  const { id }      = req.params
  const callerId    = req.user.id
  const callerPhone = normalizePhone(req.user.phone)

  try {
    const request = await prisma.requestMoney.findUnique({
      where:   { id },
      include: {
        requester: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
      },
    })

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' })
    }

    const isRequester = request.requesterId === callerId
    const isRecipient = normalizePhone(request.recipientPhone) === callerPhone

    if (!isRequester && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    return res.json({ success: true, request })
  } catch (err) {
    logger.error('getRequest error', { err: err.message, requestId: id })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

module.exports = { createRequest, payRequest, rejectRequest, cancelRequest, getRequest }