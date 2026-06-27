'use strict'
const axios        = require('axios')
const { getToken } = require('../utils/mpesaToken');
const Decimal      = require('decimal.js')
const { z }        = require('zod')
const prisma       = require('../utils/prisma')
const redis        = require('../utils/redis')
const logger       = require('../utils/logger')
const { createAndSend } = require('../services/notificationService')
const { calcFeesBuyerSide } = require('../utils/feeCalculator')

const MPESA_BASE_URL     = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY       = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET    = process.env.MPESA_CONSUMER_SECRET
const MPESA_SHORTCODE    = process.env.HOUSE_MPESA_SHORTCODE || process.env.MPESA_SHORTCODE
const MPESA_PASSKEY      = process.env.HOUSE_MPESA_PASSKEY   || process.env.MPESA_PASSKEY
const MPESA_CALLBACK_URL = process.env.MPESA_HOUSE_CALLBACK_URL


const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}


const withRetry = async (fn, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try { return await fn() }
    catch (err) {
      // Never retry timeouts — request may have reached Safaricom already
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout')
      if (isTimeout || i === retries) throw err
      // Only retry on connection errors (ECONNREFUSED, ENOTFOUND, ECONNRESET)
      const isConnErr = ['ECONNREFUSED','ENOTFOUND','ECONNRESET'].includes(err.code)
      if (!isConnErr) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

// ── Initiate STK Push ──────────────────────────────────────────────────────
const initiateHousePayment = async (req, res) => {
  try {
    const schema = z.object({ escrowId: z.string().cuid() })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { escrowId } = parsed.data
    const buyerId      = req.user.userId

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'Buyer not found' })
    const phone = normalizePhone(buyer.phone)

    const escrow = await prisma.houseEscrow.findUnique({ where: { id: escrowId } })
    if (!escrow)                    return res.status(404).json({ success: false, message: 'Escrow not found' })
    if (escrow.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Not your escrow' })

    // Atomic lock — only one STK push wins even on double-click
    // Payment can only start once the seller has accepted the deal
    const claimed = await prisma.houseEscrow.updateMany({
      where: { id: escrowId, mpesaCheckoutId: null, status: 'ACCEPTED' },
      data:  { status: 'PAYMENT_INITIATING' },
    })
    if (claimed.count === 0) {
      const msg = escrow.status === 'PENDING_ACCEPTANCE'
        ? 'Waiting for seller to accept the deal before payment can start'
        : `Payment already initiated or escrow is ${escrow.status}`
      return res.status(400).json({ success: false, message: msg })
    }

    const fees    = calcFeesBuyerSide(new Decimal(escrow.amount))
    const total   = fees.buyerTotal.toNearest(1, Decimal.ROUND_HALF_UP)

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const password  = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64')
    const token     = await getToken()

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            total.toNumber(),
      PartyA:            phone,
      PartyB:            MPESA_SHORTCODE,
      PhoneNumber:       phone,
      CallBackURL:       MPESA_CALLBACK_URL,
      AccountReference:  'LipaSafe-House',
      TransactionDesc:   'House Escrow Payment',
    }

    // Redis lock — one STK push per escrow, blocks double-click race
    const stkLockKey = `house:stk:${escrowId}`
    const stkLock = await redis.set(stkLockKey, '1', 'NX', 'EX', 30)
    if (!stkLock) return res.status(429).json({ success: false, message: 'Payment already in progress, please wait' })

    const idempotencyKey = `house-${escrowId}`

    // Fire STK first — create tx record AFTER we have real IDs
    // Eliminates race: callback arriving before pending-xxx gets updated
    let response
    try {
      response = await withRetry(() => axios.post(
        `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, payload,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      ))
    } catch (stkErr) {
      // STK call failed — rollback escrow, release lock so buyer can retry
      await prisma.houseEscrow.update({ where: { id: escrowId }, data: { status: 'ACCEPTED' } })
      await redis.del(stkLockKey)
      throw stkErr
    }

    const data = response.data
    if (data.ResponseCode !== '0') {
      await prisma.houseEscrow.update({ where: { id: escrowId }, data: { status: 'ACCEPTED' } })
      await redis.del(stkLockKey)
      return res.status(400).json({ success: false, message: data.ResponseDescription || 'STK push failed' })
    }

    // STK accepted — atomically create tx + store checkoutId on escrow
    // Callback will always find tx by real CheckoutRequestID from this point
    await prisma.$transaction([
      prisma.houseMpesaTransaction.create({
        data: {
          escrowId,
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          amount:            total.toFixed(2),
          phone,
          status:            'pending',
          idempotencyKey,
        },
      }),
      prisma.houseEscrow.update({
        where: { id: escrowId },
        data:  { mpesaCheckoutId: data.CheckoutRequestID },
      }),
    ])
    logger.info('House STK push initiated', { escrowId, amount: total.toFixed(2) })
    return res.json({ success: true, message: 'STK push sent', checkoutRequestId: data.CheckoutRequestID })
  } catch (err) {
    logger.error('initiateHousePayment failed', { error: err.message })
    console.error('initiateHousePayment ERROR:', err.message, err.response?.data)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Callback from Safaricom ────────────────────────────────────────────────
const houseMpesaCallback = async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const cb = req.body?.Body?.stkCallback
    if (!cb) return

    const { CheckoutRequestID: checkoutReqId, ResultCode: resultCode } = cb

    const dedupKey    = `house:mpesa:callback:${checkoutReqId}`
    const claimed = await redis.set(dedupKey, 'processing', 'NX', 'EX', 86400)
    if (!claimed) return

    const mpesaTx = await prisma.houseMpesaTransaction.findUnique({
      where: { checkoutRequestId: checkoutReqId },
    })
    if (!mpesaTx) return

    if (resultCode !== 0) {
      await prisma.$transaction([
        prisma.houseMpesaTransaction.update({
          where: { checkoutRequestId: checkoutReqId },
          data:  { status: 'failed', resultDesc: cb.ResultDesc },
        }),
        prisma.houseEscrow.update({
          where: { id: mpesaTx.escrowId },
          data:  { status: 'ACCEPTED', mpesaCheckoutId: null },
        }),
        prisma.houseAuditLog.create({
          data: { escrowId: mpesaTx.escrowId, action: 'PAYMENT_FAILED', meta: { resultCode, resultDesc: cb.ResultDesc } },
        }),
      ])
      await redis.setex(dedupKey, 86400, 'failed')
      return
    }

    const items    = cb.CallbackMetadata?.Item || []
    const meta     = Object.fromEntries(items.map(i => [i.Name, i.Value]).filter(([, v]) => v !== undefined))
    const mpesaRef = meta.MpesaReceiptNumber || null

    const escrow = await prisma.houseEscrow.findUnique({ where: { id: mpesaTx.escrowId } })
    if (!escrow) return

   
    const expectedAmount = new Decimal(mpesaTx.amount)
    const callbackAmount = new Decimal(meta.Amount || 0)
    if (!callbackAmount.equals(expectedAmount)) {
      logger.error('House callback amount mismatch', {
        expected: expectedAmount.toFixed(2),
        received: callbackAmount.toFixed(2),
        checkoutReqId,
      })
      await prisma.$transaction([
        prisma.houseMpesaTransaction.update({
          where: { checkoutRequestId: checkoutReqId },
          data:  { status: 'failed', resultDesc: 'Amount mismatch' },
        }),
        prisma.houseEscrow.update({
          where: { id: mpesaTx.escrowId },
          data:  { status: 'ACCEPTED', mpesaCheckoutId: null },
        }),
      ])
      await redis.setex(dedupKey, 86400, 'amount_mismatch')
      return
    }

    const safeHours = Math.min(Math.max(escrow.inspectionHours || 24, 1), 168)
    const inspectionDeadline = new Date(Date.now() + safeHours * 60 * 60 * 1000)

    // Atomic — claim + complete in one transaction prevents stuck 'processing' state
    const result = await prisma.$transaction([
      prisma.houseMpesaTransaction.updateMany({
        where: { checkoutRequestId: checkoutReqId, status: 'pending' },
        data:  { status: 'completed', mpesaRef, processedAt: new Date() },
      }),
      prisma.houseEscrow.updateMany({
        where: { id: escrow.id, status: 'PAYMENT_INITIATING' },
        data:  { status: 'PAYMENT_HELD', mpesaRef, inspectionDeadline },
      }),
      prisma.houseAuditLog.create({
        data: { escrowId: escrow.id, action: 'PAYMENT_HELD', meta: { mpesaRef, amount: escrow.amount.toString() } },
      }),
    ])
    if (result[0].count === 0) return  

    // Queue auto-release at deadline
    const houseQueue = require('../queues/houseQueue')
    await houseQueue.add(
      'auto_release',
      {
        escrowId:       escrow.id,
        sellerPhone:    escrow.sellerPhone,
        sellerReceives: escrow.sellerReceives?.toString() || escrow.amount.toString(),
      },
      { delay: safeHours * 60 * 60 * 1000, jobId: `auto_release_${escrow.id}` }
    )

    // Notify seller the moment payment is held — registered (push+SMS) or ghost (SMS only)
    try {
      const { notifySeller } = require('../services/sellerNotifier')
      await notifySeller({
        phone:         escrow.sellerPhone,
        type:          'house_payment_held',
        messageEn:     `KES ${Number(escrow.amount).toLocaleString()} held in escrow for your property. Buyer has ${escrow.inspectionHours}hrs to inspect. Funds release automatically if no dispute raised.`,
        registeredSms: `LipaSafe: KES ${Number(escrow.amount).toLocaleString()} held in escrow for your property (Ref: ${escrow.id.slice(0, 8).toUpperCase()}). Open the app to view.`,
        ghostSms:      `LipaSafe: Someone paid KES ${Number(escrow.amount).toLocaleString()} into escrow for a house deal with you (Ref: ${escrow.id.slice(0, 8).toUpperCase()}). Download LipaSafe to view & respond safely: https://play.google.com/store/apps/details?id=com.lipasafe`,
        houseEscrowId: escrow.id,
      })

      // Confirm to buyer their payment is actually held
      const smsQueue = require('../queues/smsQueue')
      await smsQueue.add('buyer_notify_payment_held', {
        type:    'raw',
        phone:   escrow.buyerPhone,
        message: `LipaSafe: Your KES ${Number(escrow.amount).toLocaleString()} is held in escrow. Seller notified. You have ${escrow.inspectionHours}hrs to inspect and confirm or dispute.`,
      })
    } catch (notifErr) {
      console.error(notifErr)
      logger.error('House payment-held notification failed', { error: notifErr.message })
    }

    await redis.setex(dedupKey, 86400, 'completed')
    logger.info('House payment held — inspection window started', { escrowId: escrow.id, inspectionDeadline })
  } catch (err) {
    logger.error('houseMpesaCallback failed', { error: err.message, stack: err.stack })
  }
}

module.exports = { initiateHousePayment, houseMpesaCallback }
