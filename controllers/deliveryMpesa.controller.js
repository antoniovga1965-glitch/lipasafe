'use strict'
const axios   = require('axios')
const { getToken } = require('../src/utils/mpesaToken');
const Decimal = require('decimal.js')
const { z }   = require('zod')
const prisma  = require('../src/utils/prisma')
const redis   = require('../src/utils/redis')
const logger  = require('../src/utils/logger')
const { calcFeesDelivery } = require('../src/utils/feeCalculator')

const MPESA_BASE_URL  = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET
const MPESA_SHORTCODE = process.env.DELIVERY_MPESA_SHORTCODE || process.env.MPESA_SHORTCODE
const MPESA_PASSKEY   = process.env.DELIVERY_MPESA_PASSKEY   || process.env.MPESA_PASSKEY
const MPESA_CALLBACK_URL = process.env.DELIVERY_MPESA_CALLBACK_URL || (process.env.MPESA_CALLBACK_URL || '').replace('/mpesa/callback', '/delivery-mpesa/callback')
// SERVICE_FEE_RATE removed — use feeCalculator.js

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
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

// ── Initiate STK Push for delivery escrow ──
const initiateDeliveryPayment = async (req, res) => {
  try {
    const schema = z.object({ orderId: z.string().min(1) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { orderId } = parsed.data
    const buyerId     = req.user.userId

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'Buyer not found' })
    const phone = normalizePhone(buyer.phone)

    const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
    if (!order)                          return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.buyerId !== buyerId)       return res.status(403).json({ success: false, message: 'Not your order' })
    if (order.status !== 'PENDING_PAYMENT') return res.status(400).json({ success: false, message: `Order is ${order.status}` })
    if (order.mpesaCheckoutId)           return res.status(400).json({ success: false, message: 'Payment already initiated' })

    // Atomic claim — placeholder checkout ID blocks a second concurrent request
    // from also passing the mpesaCheckoutId check above before the real STK push completes
    const claimed = await prisma.deliveryOrder.updateMany({
      where: { id: orderId, status: 'PENDING_PAYMENT', mpesaCheckoutId: null },
      data:  { mpesaCheckoutId: 'PENDING_' + orderId },
    })
    if (claimed.count === 0) return res.status(400).json({ success: false, message: 'Payment already initiated' })

    const amount    = new Decimal(order.amount)
    const fees      = calcFeesDelivery(amount)
    const fee       = fees.totalFee
    const total     = fees.buyerTotal

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
      AccountReference:  'LipaSafe-Delivery',
      TransactionDesc:   'Delivery Escrow Payment',
    }

    const response = await withRetry(() => axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
    ))

    const data = response.data
    if (data.ResponseCode !== '0') {
      return res.status(400).json({ success: false, message: data.ResponseDescription || 'STK push failed' })
    }

    await prisma.$transaction([
      prisma.deliveryOrder.update({
        where: { id: orderId },
        data:  { mpesaCheckoutId: data.CheckoutRequestID },
      }),
      prisma.deliveryMpesaTransaction.create({
        data: {
          orderId,
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          amount:            amount.toFixed(2),
          fee:               fee.toFixed(2),
          totalCharged:      total.toFixed(2),
          phone,
          status:            'pending',
        },
      }),
    ])

    logger.info('Delivery STK push initiated', { orderId, amount: total.toFixed(2) })
    return res.json({ success: true, message: 'STK push sent', checkoutRequestId: data.CheckoutRequestID })

  } catch (err) {
    logger.error('initiateDeliveryPayment failed', { error: err.message })
    // Release the placeholder claim so the buyer isn't permanently locked out
    try {
      const { orderId: failedOrderId } = req.body || {}
      if (failedOrderId) {
        await prisma.deliveryOrder.updateMany({
          where: { id: failedOrderId, mpesaCheckoutId: { startsWith: 'PENDING_' } },
          data:  { mpesaCheckoutId: null },
        })
      }
    } catch (releaseErr) {
      logger.error('initiateDeliveryPayment: failed to release claim', { error: releaseErr.message })
    }
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Callback from Safaricom ──
const deliveryMpesaCallback = async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })

  try {
    const cb = req.body?.Body?.stkCallback
    if (!cb) return

    const { CheckoutRequestID: checkoutReqId, ResultCode: resultCode } = cb

    const dedupKey    = `delivery:mpesa:callback:${checkoutReqId}`
    const alreadyDone = await redis.get(dedupKey)
    if (alreadyDone) return

    const mpesaTx = await prisma.deliveryMpesaTransaction.findUnique({
      where: { checkoutRequestId: checkoutReqId },
    })
    if (!mpesaTx) return

    if (resultCode !== 0) {
      await prisma.deliveryMpesaTransaction.update({
        where: { checkoutRequestId: checkoutReqId },
        data:  { status: 'failed', resultDesc: cb.ResultDesc },
      })
      await redis.setex(dedupKey, 86400, 'failed')
      return
    }

    const items    = cb.CallbackMetadata?.Item || []
    const meta     = Object.fromEntries(items.map(i => [i.Name, i.Value]).filter(([, v]) => v !== undefined))
    const mpesaRef = meta.MpesaReceiptNumber || null

    // Atomic claim
    const claimed = await prisma.deliveryMpesaTransaction.updateMany({
      where: { checkoutRequestId: checkoutReqId, status: 'pending' },
      data:  { status: 'processing' },
    })
    if (claimed.count === 0) return

    const order = await prisma.deliveryOrder.findUnique({ where: { id: mpesaTx.orderId } })
    if (!order) return

    await prisma.$transaction([
      prisma.deliveryMpesaTransaction.update({
        where: { checkoutRequestId: checkoutReqId },
        data:  { status: 'completed', mpesaRef, processedAt: new Date() },
      }),
      prisma.deliveryOrder.update({
        where: { id: order.id },
        data:  { status: 'PENDING_PHOTO_UPLOAD', mpesaRef },
      }),
      prisma.deliveryEscrow.create({
        data: {
          orderId: order.id,
          amount:  order.amount,
          status:  'held',
          heldAt:  new Date(),
        },
      }),
    ])

    // SMS to delivery guy
    const smsQueue = require('../src/queues/smsQueue')
    await smsQueue.add('send-sms', {
      to:      normalizePhone(order.deliveryGuyPhone),
      message: `LipaSafe: New delivery job! Goods: ${order.goods}. Amount: KES ${order.amount}. Open the app and upload a BEFORE photo to accept.`,
    })

    await redis.setex(dedupKey, 86400, 'completed')
    logger.info('Delivery payment confirmed — escrow held', { orderId: order.id, mpesaRef })

  } catch (err) {
    logger.error('deliveryMpesaCallback failed', { error: err.message, stack: err.stack })
  }
}

// ── Poll payment status ──
const pollDeliveryPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params
    const buyerId = req.user.userId

    const mpesaTx = await prisma.deliveryMpesaTransaction.findUnique({
      where: { checkoutRequestId },
    })
    if (!mpesaTx) return res.status(404).json({ success: false, message: 'Transaction not found' })

    const order = await prisma.deliveryOrder.findUnique({ where: { id: mpesaTx.orderId } })
    if (!order || order.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Forbidden' })

    return res.json({
      success:     true,
      status:      mpesaTx.status,
      mpesaRef:    mpesaTx.mpesaRef,
      orderStatus: order.status,
    })
  } catch (err) {
    logger.error('pollDeliveryPaymentStatus failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

module.exports = { initiateDeliveryPayment, deliveryMpesaCallback, pollDeliveryPaymentStatus }
