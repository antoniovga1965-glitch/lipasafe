'use strict'
const axios    = require('axios')
const { getToken } = require('../utils/mpesaToken');
const { calcFeesBuyerSide } = require('../utils/feeCalculator');
const Decimal  = require('decimal.js')
const { z }    = require('zod')
const prisma   = require('../utils/prisma')
const redis    = require('../utils/redis')
const logger   = require('../utils/logger')

const MPESA_BASE_URL     = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY       = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET    = process.env.MPESA_CONSUMER_SECRET
const MPESA_SHORTCODE    = process.env.MPESA_STK_SHORTCODE || process.env.MPESA_SHORTCODE
const MPESA_PASSKEY      = process.env.MPESA_PASSKEY
const MPESA_CALLBACK_URL = process.env.MPESA_CUSTOM_CALLBACK_URL
const SERVICE_FEE_RATE   = new Decimal('0.02')

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '')
  let normalized
  if (digits.startsWith('0'))         normalized = '254' + digits.slice(1)
  else if (digits.startsWith('254'))  normalized = digits
  else throw new Error(`Invalid phone: ${phone}`)
  if (!/^254\d{9}$/.test(normalized)) throw new Error(`Invalid phone: ${phone}`)
  return normalized
}


const withRetry = async (fn, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() } catch (err) {
      const isTimeout  = err.code === 'ECONNABORTED' || err.message?.includes('timeout')
      const isConnErr  = ['ECONNREFUSED','ENOTFOUND','ECONNRESET'].includes(err.code)
      if (isTimeout || (!isConnErr) || i === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

// ── Initiate STK Push ──────────────────────────────────────────────────────
const initiateCustomPayment = async (req, res) => {
  try {
    const { escrowId } = req.params
    if (!escrowId) {
      return res.status(400).json({ success: false, message: 'escrowId is required' })
    }
    const buyerId      = req.user.userId

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'Buyer not found' })

    const phone  = normalizePhone(buyer.phone)
    const escrow = await prisma.customEscrow.findUnique({ where: { id: escrowId } })
    if (!escrow)                    return res.status(404).json({ success: false, message: 'Escrow not found' })
    if (escrow.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Not your escrow' })
    if (escrow.status !== 'ACCEPTED') {
      return res.status(400).json({ success: false, message: `Escrow is ${escrow.status} — counterparty must accept first` })
    }

    // Atomic lock — one STK push only
    const claimed = await prisma.customEscrow.updateMany({
      where: { id: escrowId, mpesaCheckoutId: null, status: 'ACCEPTED' },
      data:  { status: 'PAYMENT_INITIATING' },
    })
    if (claimed.count === 0) {
      return res.status(400).json({ success: false, message: 'Payment already initiated' })
    }

    const amount  = new Decimal(escrow.amount)
    // Buyer covers platformFee + B2C on top — seller always receives escrow.amount clean
    const fees    = calcFeesBuyerSide(amount)
    const total   = fees.buyerTotal.toNearest(1, Decimal.ROUND_HALF_UP)

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const password  = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64')
    const token     = await getToken()

    const idempotencyKey = `custom-${escrowId}-${Date.now()}`

    // Create pending tx BEFORE STK push
    const pendingTx = await prisma.customMpesaTransaction.create({
      data: {
        escrowId,
        checkoutRequestId: `pending-${idempotencyKey}`,
        merchantRequestId: null,
        amount:            total.toFixed(2),
        fee:               new Decimal(escrow.platformFee).toFixed(2),
        phone,
        status:            'pending',
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
          Amount:            total.toNumber(),
          PartyA:            phone,
          PartyB:            MPESA_SHORTCODE,
          PhoneNumber:       phone,
          CallBackURL:       MPESA_CALLBACK_URL,
          AccountReference:  'LipaSafe-Custom',
          TransactionDesc:   `Custom Escrow: ${escrow.title.slice(0, 30)}`,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      ))
    } catch (stkErr) {
      await prisma.customMpesaTransaction.delete({ where: { id: pendingTx.id } })
      await prisma.customEscrow.update({ where: { id: escrowId }, data: { status: 'ACCEPTED' } })
      throw stkErr
    }

    const data = response.data
    if (data.ResponseCode !== '0') {
      await prisma.customMpesaTransaction.delete({ where: { id: pendingTx.id } })
      await prisma.customEscrow.update({ where: { id: escrowId }, data: { status: 'ACCEPTED' } })
      return res.status(400).json({ success: false, message: data.ResponseDescription || 'STK push failed' })
    }

    await prisma.$transaction([
      prisma.customMpesaTransaction.update({
        where: { id: pendingTx.id },
        data:  { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID },
      }),
      prisma.customEscrow.update({
        where: { id: escrowId },
        data:  { mpesaCheckoutId: data.CheckoutRequestID },
      }),
    ])

    logger.info('Custom STK push initiated', { escrowId, amount: total.toFixed(2) })
    return res.json({ success: true, message: 'STK push sent. Approve on your phone.', checkoutRequestId: data.CheckoutRequestID })
  } catch (err) {
    logger.error(`initiateCustomPayment failed: ${err.message} | stack: ${err.stack}`)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── STK Callback ───────────────────────────────────────────────────────────
const customMpesaCallback = async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const cb = req.body?.Body?.stkCallback
    if (!cb) return

    const { CheckoutRequestID: checkoutReqId, ResultCode: resultCode } = cb

    const dedupKey    = `custom:mpesa:callback:${checkoutReqId}`
    const alreadyDone = await redis.get(dedupKey)
    if (alreadyDone) return

    const mpesaTx = await prisma.customMpesaTransaction.findUnique({
      where: { checkoutRequestId: checkoutReqId },
    })
    if (!mpesaTx) return

    if (Number(resultCode) !== 0) {
      await prisma.$transaction([
        prisma.customMpesaTransaction.update({
          where: { checkoutRequestId: checkoutReqId },
          data:  { status: 'failed', resultDesc: cb.ResultDesc },
        }),
        prisma.customAuditLog.create({
          data: { escrowId: mpesaTx.escrowId, action: 'PAYMENT_FAILED', meta: { resultCode, resultDesc: cb.ResultDesc } },
        }),
      ])
      // Roll back escrow to ACCEPTED so buyer can retry
      await prisma.customEscrow.update({
        where: { id: mpesaTx.escrowId },
        data:  { status: 'ACCEPTED', mpesaCheckoutId: null },
      })
      await redis.setex(dedupKey, 86400, 'failed')
      return
    }

    const items    = cb.CallbackMetadata?.Item || []
    const meta     = Object.fromEntries(items.map(i => [i.Name, i.Value]).filter(([, v]) => v !== undefined))
    const mpesaRef = meta.MpesaReceiptNumber || null

    // Verify amount
    const expectedAmount = new Decimal(mpesaTx.amount)
    const callbackAmount = new Decimal(meta.Amount || 0)
    if (!callbackAmount.equals(expectedAmount)) {
      logger.error('Custom callback amount mismatch', {
        expected: expectedAmount.toFixed(2), received: callbackAmount.toFixed(2), checkoutReqId,
      })

      await prisma.$transaction([
        prisma.customMpesaTransaction.updateMany({
          where: { checkoutRequestId: checkoutReqId, status: 'pending' },
          data:  { status: 'mismatch', resultDesc: `Expected KES ${expectedAmount.toFixed(2)}, received KES ${callbackAmount.toFixed(2)}` },
        }),
        prisma.customEscrow.update({
          where: { id: mpesaTx.escrowId },
          data:  { status: 'PAYMENT_MISMATCH' },
        }),
        prisma.customAuditLog.create({
          data: {
            escrowId: mpesaTx.escrowId,
            action: 'PAYMENT_MISMATCH',
            meta: { expected: expectedAmount.toFixed(2), received: callbackAmount.toFixed(2), checkoutReqId, mpesaRef: meta.MpesaReceiptNumber || null },
          },
        }),
      ])

      const adminPhone = process.env.ADMIN_PHONE
      if (adminPhone) {
        const smsQ = require('../queues/smsQueue')
        try {
          await smsQ.add('send-sms', {
            to: adminPhone,
            message: `LIPASAFE CRITICAL: Custom escrow payment mismatch. Escrow: ${mpesaTx.escrowId.slice(0, 8).toUpperCase()}. Expected KES ${expectedAmount.toFixed(2)}, got KES ${callbackAmount.toFixed(2)}. Manual review required NOW.`,
          })
        } catch (smsErr) {
          logger.error('Mismatch admin SMS failed', { error: smsErr.message })
        }
      }

      await redis.setex(dedupKey, 86400, 'amount_mismatch')
      return
    }

    const escrow = await prisma.customEscrow.findUnique({ where: { id: mpesaTx.escrowId } })
    if (!escrow) return

    const result = await prisma.$transaction([
      prisma.customMpesaTransaction.updateMany({
        where: { checkoutRequestId: checkoutReqId, status: 'pending' },
        data:  { status: 'completed', mpesaRef, processedAt: new Date() },
      }),
      prisma.customEscrow.update({
        where: { id: escrow.id },
        data:  { status: 'PAYMENT_HELD', mpesaRef },
      }),
      prisma.customAuditLog.create({
        data: { escrowId: escrow.id, action: 'PAYMENT_HELD', meta: { mpesaRef, amount: escrow.amount.toString() } },
      }),
    ])
    if (result[0].count === 0) return

    // Notify both parties — payment already held, never let SMS failure mask a successful callback
    const buyer = await prisma.user.findUnique({ where: { id: escrow.buyerId }, select: { phone: true } })
    const smsQ = require('../queues/smsQueue')
    try {
      await smsQ.add('send-sms', {
        to:      normalizePhone(buyer.phone),
        message: `LipaSafe: KES ${Number(escrow.amount).toFixed(0)} held in escrow for "${escrow.title}". Ref: ${mpesaRef}. Complete the deal and confirm when done.`,
      })
      await smsQ.add('send-sms', {
        to:      escrow.counterpartyPhone,
        message: `LipaSafe: KES ${Number(escrow.counterpartyReceives).toFixed(0)} is held in escrow for "${escrow.title}". Complete your side of the deal.`,
      })
    } catch (smsErr) {
      logger.error('customMpesaCallback: SMS queue failed after payment held', { escrowId: escrow.id, error: smsErr.message })
    }

    await redis.setex(dedupKey, 86400, 'completed')
    logger.info('Custom payment held', { escrowId: escrow.id, mpesaRef })
  } catch (err) {
    logger.error('customMpesaCallback failed', { error: err.message, stack: err.stack })
  }
}

module.exports = { initiateCustomPayment, customMpesaCallback }
