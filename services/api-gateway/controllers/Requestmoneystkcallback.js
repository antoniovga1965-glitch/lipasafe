'use strict'
const pw = require('../src/utils/platformWallet')

const crypto             = require('crypto')
const prisma             = require('../src/utils/prisma')
const logger             = require('../src/utils/logger')
const { initiateB2C }    = require('../src/utils/mpesaB2C')
const { createAndSend }  = require('../src/services/notificationService')
const smsQueue           = require('../src/queues/smsQueue')
const requestMoneyQueue  = require('../src/queues/Requestmoneyqueue')
const b2cRetryQueue      = require('../src/queues/b2cRetryQueue')
const redis              = require('../src/utils/redis')

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

/**
 * POST /request/stk-callback
 *
 * Safaricom calls this after the customer enters their M-Pesa PIN.
 * We ALWAYS respond 200 immediately, then do all processing async.
 *
 * Race condition protection:
 *   – updateMany WHERE state = 'PENDING' is atomic; only one callback wins.
 *   – B2C fires only after confirmed DB update (count > 0).
 *   – Duplicate callbacks are silently ignored.
 */
const handleStkCallback = async (req, res) => {
  // Respond to Safaricom immediately — they retry if they don't get 200 fast
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })

  try {
    const callback = req.body?.Body?.stkCallback
    if (!callback) {
      logger.warn('requestMoney STK callback: malformed body', { body: req.body })
      return
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = callback

    logger.info('requestMoney STK callback received', { CheckoutRequestID, ResultCode, ResultDesc })

    // ── Find request by checkoutRequestId ─────────────────────────────────────
    const request = await prisma.requestMoney.findUnique({
      where:   { checkoutRequestId: CheckoutRequestID },
      include: { requester: { select: { id: true, fullName: true, phone: true } } },
    })

    if (!request) {
      logger.warn('requestMoney STK callback: no matching request', { CheckoutRequestID })
      return
    }

    // ── STK failed or user cancelled — stay PENDING, user can retry ──────────
    if (ResultCode !== 0) {
      logger.info('requestMoney STK not completed by user', {
        requestId: request.id,
        ResultCode,
        ResultDesc,
      })
      return
    }

    // ── Extract M-Pesa receipt from callback metadata ─────────────────────────
    const items    = callback.CallbackMetadata?.Item || []
    const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value ?? null

    // ── Atomic PENDING → PAID transition ──────────────────────────────────────
    // updateMany with WHERE state = 'PENDING' ensures only one callback succeeds.
    // If a duplicate callback arrives, updated.count === 0 and we bail safely.
    const updated = await prisma.requestMoney.updateMany({
      where: { id: request.id, state: 'PENDING' },
      data:  { state: 'PAID', mpesaRef },
    })

    if (updated.count === 0) {
      logger.warn('requestMoney STK callback: already processed (duplicate or race)', {
        requestId: request.id,
        CheckoutRequestID,
      })
      return
    }

    logger.info('requestMoney marked PAID', { requestId: request.id, mpesaRef })

    // ── Remove expiry job — no longer needed ──────────────────────────────────
    try {
      const job = await requestMoneyQueue.getJob(`expire-${request.id}`)
      if (job) await job.remove()
    } catch (e) {
      logger.warn('handleStkCallback: failed to remove expiry job', { requestId: request.id })
    }

    const purposeLabel   = PURPOSE_LABELS[request.purpose] || request.purpose
    const requesterPhone = normalizePhone(request.requester.phone)
    const shortRef       = request.id.slice(0, 8).toUpperCase()

    // ── B2C payout → requester's M-Pesa (they get the exact amount they requested) ──
    const b2cOriginatorId = `RM-${request.id.slice(0, 12)}-${crypto.randomUUID().slice(0, 6)}`
    try {
      await initiateB2C({
        phone:          requesterPhone,
        amount:         Number(request.amount),
        originatorId:   b2cOriginatorId,
        transactionId:  request.id,
        remarks:        `LipaSafe request payout — ${purposeLabel}`,
      })
      await redis.set(`originator:${b2cOriginatorId}`, `request_money:${request.id}`, 'EX', 86400)
      logger.info('B2C payout initiated', {
        requestId: request.id,
        phone:     requesterPhone,
        amount:    request.amount,
      })
    } catch (b2cErr) {
      // B2C failed — money collected from recipient but not yet paid to requester.
      // Queue for automatic retry with exponential backoff. Do NOT revert state.
      logger.error('CRITICAL: B2C payout failed after successful STK — queued for retry', {
        requestId:    request.id,
        requesterPhone,
        amount:       request.amount,
        err:          b2cErr.message,
      })
      await b2cRetryQueue.add('b2c_retry', {
        phone:         requesterPhone,
        amount:        Number(request.amount),
        originatorId:  b2cOriginatorId,
        transactionId: request.id,
        remarks:       `LipaSafe request payout — ${purposeLabel}`,
        requestId:     request.id,
      }, {
        jobId: `b2c-retry-${request.id}`,   // deduplicates if we ever double-queue
      }).catch(qErr =>
        logger.error('CRITICAL: b2cRetryQueue.add also failed — MANUAL INTERVENTION REQUIRED', {
          requestId: request.id,
          err:       qErr.message,
        })
      )
    }

    // ── Credit platform wallet with platformFee ───────────────────────────────
    // Platform absorbs B2C charge from this fee.
    try {
      await pw.credit(
        prisma,
        Number(request.platformFee),
        `RM-FEE-${request.id}`,
        `Platform fee for request money ${request.id}`
      )
    } catch (walletErr) {
      logger.warn('handleStkCallback: platform wallet credit failed', {
        requestId: request.id,
        err:       walletErr.message,
      })
    }

    // ── Fetch recipient user info for notifications ────────────────────────────
    const recipientUser = await prisma.user.findUnique({
      where:  { phone: request.recipientPhone },
      select: { id: true, fullName: true },
    }).catch(() => null)

    const recipientName = recipientUser?.fullName || request.recipientPhone

    // ── SMS requester ─────────────────────────────────────────────────────────
    await smsQueue.add('request_paid_sms_requester', {
      type:    'raw',
      phone:   requesterPhone,
      message: `${recipientName} paid your KES ${Number(request.amount)} request for ${purposeLabel}. Money is on its way to your M-Pesa. Ref: ${shortRef}`,
    })

    // ── SMS recipient ─────────────────────────────────────────────────────────
    await smsQueue.add('request_paid_sms_recipient', {
      type:    'raw',
      phone:   request.recipientPhone,
      message: `You paid KES ${Number(request.recipientPays)} to ${request.requester.fullName} for ${purposeLabel}. Ref: ${shortRef}`,
    })

    // ── Push to requester ─────────────────────────────────────────────────────
    createAndSend({
      userId:    request.requester.id,
      type:      'money_request_paid',
      messageEn: `${recipientName} paid your KES ${Number(request.amount)} request for ${purposeLabel}. Money is on its way to your M-Pesa. Ref: ${shortRef}`,
      channel:   'push',
    }).catch(err => logger.warn('handleStkCallback: push to requester failed', { err: err.message }))

    // ── Push to recipient (if registered) ────────────────────────────────────
    if (recipientUser) {
      createAndSend({
        userId:    recipientUser.id,
        type:      'money_request_paid',
        messageEn: `You paid KES ${Number(request.recipientPays)} to ${request.requester.fullName} for ${purposeLabel}. Ref: ${shortRef}`,
        channel:   'push',
      }).catch(err => logger.warn('handleStkCallback: push to recipient failed', { err: err.message }))
    }

  } catch (err) {
    logger.error('requestMoney STK callback: unhandled error', { err: err.message, stack: err.stack })
  }
}

module.exports = { handleStkCallback }