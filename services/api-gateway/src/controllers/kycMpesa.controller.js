'use strict'
const axios    = require('axios')
const { getToken } = require('../utils/mpesaToken');
const Decimal  = require('decimal.js')
const { z }    = require('zod')
const prisma   = require('../utils/prisma')
const redis    = require('../utils/redis')
const logger   = require('../utils/logger')
const { KYC_TIERS, promoteTrusted } = require('../services/kycService')
const pw       = require('../utils/platformWallet')

const MPESA_BASE_URL     = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY       = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET    = process.env.MPESA_CONSUMER_SECRET
const MPESA_SHORTCODE    = process.env.MPESA_STK_SHORTCODE || process.env.MPESA_SHORTCODE
const MPESA_PASSKEY      = process.env.MPESA_PASSKEY
const MPESA_CALLBACK_URL = process.env.MPESA_KYC_CALLBACK_URL

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '')
  let normalized
  if (digits.startsWith('0'))        normalized = '254' + digits.slice(1)
  else if (digits.startsWith('254')) normalized = digits
  else throw new Error(`Invalid phone: ${phone}`)
  if (!/^254\d{9}$/.test(normalized)) throw new Error(`Invalid phone: ${phone}`)
  return normalized
}


const withRetry = async (fn, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout')
      const isConnErr = ['ECONNREFUSED','ENOTFOUND','ECONNRESET'].includes(err.code)
      if (isTimeout || !isConnErr || i === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

// ── POST /kyc-mpesa/pay ──────────────────────────────────────────────────────
const initiateKycPayment = async (req, res) => {
  try {
    const schema = z.object({
      tier: z.enum(['verified', 'trusted']),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { tier } = parsed.data
    const userId   = req.user.userId
    const tierCfg  = KYC_TIERS[tier]

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { phone: true, kycStatus: true, kycTier: true },
    })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    // Guards
    if (tier === 'trusted') {
      return res.status(400).json({ success: false, message: 'Trusted status is earned, not purchased. Use /kyc/claim-trusted.' })
    }
    if (tier === 'verified' && (user.kycStatus === 'verified' || user.kycTier === 'trusted')) {
      return res.status(400).json({ success: false, message: 'Already verified' })
    }

    // Prevent double payment — one pending at a time
    const existing = await prisma.kycPayment.findFirst({
      where: { userId, tier, status: 'pending' },
    })
    if (existing) {
      // Auto-expire pending payments older than 10 minutes
      const ageMs = Date.now() - new Date(existing.createdAt).getTime()
      if (ageMs < 10 * 60 * 1000) {
        return res.json({
          success: true,
          message: 'Payment already initiated — approve on your phone',
          checkoutRequestId: existing.checkoutRequestId,
        })
      }
      // Stale — expire it and allow a fresh STK push
      await prisma.kycPayment.update({
        where: { id: existing.id },
        data:  { status: 'failed' },
      })
    }

    const phone          = normalizePhone(user.phone)
    const amount         = tierCfg.fee
    const timestamp      = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const password       = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64')
    const token          = await getToken()
    const idempotencyKey = `kyc-${tier}-${userId}-${Date.now()}`

    // Create pending record BEFORE STK push
    const pending = await prisma.kycPayment.create({
      data: {
        userId,
        tier,
        amount:            amount.toString(),
        phone,
        status:            'pending',
        checkoutRequestId: `pending-${idempotencyKey}`,
        idempotencyKey,
      },
    })

    let response
    try {
      response = await withRetry(() => axios.post(
        `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: MPESA_SHORTCODE,
          Password:          password,
          Timestamp:         timestamp,
          TransactionType:   'CustomerPayBillOnline',
          Amount:            amount,
          PartyA:            phone,
          PartyB:            MPESA_SHORTCODE,
          PhoneNumber:       phone,
          CallBackURL:       MPESA_CALLBACK_URL,
          AccountReference:  'LipaSafe-KYC',
          TransactionDesc:   `LipaSafe ${tier} verification fee`,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      ))
    } catch (stkErr) {
      await prisma.kycPayment.delete({ where: { id: pending.id } })
      throw stkErr
    }

    const data = response.data
    if (data.ResponseCode !== '0') {
      await prisma.kycPayment.delete({ where: { id: pending.id } })
      return res.status(400).json({ success: false, message: data.ResponseDescription || 'STK push failed' })
    }

    await prisma.kycPayment.update({
      where: { id: pending.id },
      data:  {
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID,
      },
    })

    logger.info('KYC payment initiated', { userId, tier, amount })
    return res.json({
      success:           true,
      message:           `STK push sent. Approve KES ${amount} on your phone.`,
      checkoutRequestId: data.CheckoutRequestID,
    })
  } catch (err) {
    console.error(err)
    logger.error('initiateKycPayment error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

// ── POST /kyc-mpesa/callback ─────────────────────────────────────────────────
const kycMpesaCallback = async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const cb = req.body?.Body?.stkCallback
    if (!cb) return

    const { CheckoutRequestID: checkoutReqId, ResultCode: resultCode } = cb

    // Dedup
    const dedupKey    = `kyc:mpesa:callback:${checkoutReqId}`
    const alreadyDone = await redis.get(dedupKey)
    if (alreadyDone) return

    const payment = await prisma.kycPayment.findUnique({
      where: { checkoutRequestId: checkoutReqId },
    })
    if (!payment) return

    if (Number(resultCode) !== 0) {
      await prisma.kycPayment.update({
        where: { checkoutRequestId: checkoutReqId },
        data:  { status: 'failed' },
      })
      await redis.setex(dedupKey, 86400, 'failed')
      return
    }

    const items    = cb.CallbackMetadata?.Item || []
    const meta     = Object.fromEntries(items.map(i => [i.Name, i.Value]).filter(([, v]) => v !== undefined))
    const mpesaRef = meta.MpesaReceiptNumber || null

    // Verify amount
    const expected = new Decimal(payment.amount)
    const received = new Decimal(meta.Amount || 0)
    if (!received.equals(expected)) {
      logger.error('KYC callback amount mismatch', { expected: expected.toFixed(2), received: received.toFixed(2) })
      await redis.setex(dedupKey, 86400, 'amount_mismatch')
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.kycPayment.update({
        where: { checkoutRequestId: checkoutReqId },
        data:  { status: 'completed', mpesaRef, processedAt: new Date() },
      })
      await pw.credit(tx, payment.amount, mpesaRef, `KYC fee - ${payment.tier}`)
    })

    // If trusted tier — auto promote immediately after payment
    if (payment.tier === 'trusted') {
      try {
        await promoteTrusted(payment.userId)
        logger.info('Trusted promotion complete', { userId: payment.userId, mpesaRef })
      } catch (promoteErr) {
        // Payment went through but requirements not met — log it, don't crash
        logger.error('Trusted promotion failed after payment', {
          userId: payment.userId, reason: promoteErr.message,
        })
      }
    }

    // If verified tier — payment done, app will show doc upload screen
    // (kycStatus stays 'unverified' until docs are actually submitted)
    if (payment.tier === 'verified') {
      logger.info('Verified payment complete — awaiting doc submission', {
        userId: payment.userId, mpesaRef,
      })
    }

    await redis.setex(dedupKey, 86400, 'completed')
  } catch (err) {
    logger.error('kycMpesaCallback error', { err: err.message, stack: err.stack })
  }
}

// ── GET /kyc-mpesa/status/:checkoutRequestId ────────────────────────────────
const pollKycPayment = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params
    const payment = await prisma.kycPayment.findUnique({
      where:  { checkoutRequestId },
      select: { status: true, tier: true, mpesaRef: true, processedAt: true },
    })
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' })
    return res.json({ success: true, data: payment })
  } catch (err) {
    logger.error('pollKycPayment error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

module.exports = { initiateKycPayment, kycMpesaCallback, pollKycPayment }
