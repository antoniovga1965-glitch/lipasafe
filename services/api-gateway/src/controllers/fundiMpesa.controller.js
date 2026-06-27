'use strict'
const axios        = require('axios')
const { getToken } = require('../utils/mpesaToken');
const crypto       = require('crypto')
const Decimal      = require('decimal.js')
const { z }        = require('zod')
const prisma       = require('../utils/prisma')
const redis        = require('../utils/redis')
const logger       = require('../utils/logger')

const MPESA_BASE_URL  = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET

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

const MPESA_SHORTCODE      = process.env.FUNDI_MPESA_SHORTCODE || process.env.MPESA_SHORTCODE
const MPESA_PASSKEY        = process.env.FUNDI_MPESA_PASSKEY   || process.env.MPESA_PASSKEY
const MPESA_CALLBACK_URL   = process.env.MPESA_CALLBACK_URL?.replace('/mpesa/callback', '/fundi-mpesa/callback') || process.env.MPESA_CALLBACK_URL



// ── Initiate STK Push for fundi job payment ──
const initiateFundiPayment = async (req, res) => {
  try {
    const schema = z.object({
      jobId:  z.string().uuid(),

    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { jobId } = parsed.data
    const buyerId   = req.user.userId
    const buyer     = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'Buyer not found' })
    const phone     = normalizePhone(buyer.phone)

    const job = await prisma.fundiJob.findUnique({ where: { id: jobId } })

    if (!job)                          return res.status(404).json({ success: false, message: 'Job not found' })
    if (job.buyerId !== buyerId)       return res.status(403).json({ success: false, message: 'Not your job' })
    if (job.status !== 'PENDING_PAYMENT') return res.status(400).json({ success: false, message: `Job is ${job.status}` })
    if (job.mpesaCheckoutId)           return res.status(400).json({ success: false, message: 'Payment already initiated' })

    // Fee already computed once at createJob time via calcFeesFundi — read it, don't recompute.
    const amount = new Decimal(job.amount)
    const fee    = new Decimal(job.serviceFee)
    const total  = new Decimal(job.totalCharged)

    const timestamp  = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const password   = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64')
    const token      = await getToken()

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(total.toNumber()),
      PartyA:            phone,
      PartyB:            MPESA_SHORTCODE,
      PhoneNumber:       phone,
      CallBackURL:       MPESA_CALLBACK_URL,
      AccountReference:  'LipaSafe-Fundi',
      TransactionDesc:   'Fundi Job Payment',
    }

    const response = await withRetry(() => axios.post(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
      }))

    const data = response.data
    if (data.ResponseCode !== '0') {
      return res.status(400).json({ success: false, message: data.ResponseDescription || 'STK push failed' })
    }

   const idempotencyKey = `fundi-${jobId}`

    await prisma.$transaction([
      prisma.fundiJob.update({
        where: { id: jobId },
        data:  { mpesaCheckoutId: data.CheckoutRequestID },
      }),
      prisma.fundiMpesaTransaction.create({
        data: {
          jobId,
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          amount:            amount.toFixed(2),
          fee:               fee.toFixed(2),
          totalCharged:      total.toFixed(2),
          phone,
          status:            'pending',
          idempotencyKey,
        },
      }),
    ])

    logger.info('Fundi STK push initiated', { jobId, amount: total.toFixed(2) })

    return res.json({
      success:           true,
      message:           'STK push sent',
      checkoutRequestId: data.CheckoutRequestID,
    })

  } catch (err) {
    logger.error('fundiMpesa.initiateFundiPayment failed', { error: err.message })
    console.error('initiateFundiPayment ERROR:', err.message, err.response?.data)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Callback from Safaricom ──
const fundiMpesaCallback = async (req, res) => {
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })

  try {
    const cb             = req.body?.Body?.stkCallback
    if (!cb) return

    const { CheckoutRequestID: checkoutReqId, ResultCode: resultCode } = cb

    const dedupKey    = `fundi:mpesa:callback:${checkoutReqId}`
    const alreadyDone = await redis.get(dedupKey)
    if (alreadyDone) return

    const mpesaTx = await prisma.fundiMpesaTransaction.findUnique({
      where: { checkoutRequestId: checkoutReqId },
    })
    if (!mpesaTx) return

    if (resultCode !== 0) {
      await prisma.fundiMpesaTransaction.update({
        where: { checkoutRequestId: checkoutReqId },
        data:  { status: 'failed', resultDesc: cb.ResultDesc },
      })
      await redis.setex(dedupKey, 86400, 'failed')
      return
    }

    const items   = cb.CallbackMetadata?.Item || []
    const meta    = Object.fromEntries(items.map(i => [i.Name, i.Value]).filter(([, v]) => v !== undefined))
    const mpesaRef = meta.MpesaReceiptNumber || null

    // Atomic claim
    const claimed = await prisma.fundiMpesaTransaction.updateMany({
      where: { checkoutRequestId: checkoutReqId, status: 'pending' },
      data:  { status: 'processing' },
    })
    if (claimed.count === 0) return

    const job = await prisma.fundiJob.findUnique({ where: { id: mpesaTx.jobId } })
    if (!job) return

    // Generate OTP
    const otp        = Math.floor(1000 + Math.random() * 9000).toString()
    const otpHash    = require('crypto').createHash('sha256').update(otp).digest('hex')
    const otpExpiry  = new Date(Date.now() + 30 * 60 * 1000) 

    await prisma.$transaction([
      prisma.fundiMpesaTransaction.update({
        where: { checkoutRequestId: checkoutReqId },
        data:  { status: 'completed', mpesaRef, processedAt: new Date() },
      }),
      prisma.fundiJob.update({
        where: { id: job.id },
        data:  {
          status:       'WAITING_FOR_FUNDI_ACCEPTANCE',
          mpesaRef,
          otpHash,
          otpExpiresAt: otpExpiry,
        },
      }),
      prisma.fundiEscrow.create({
        data: {
          jobId:  job.id,
          amount: job.amount,
          status: 'held',
          heldAt: new Date(),
        },
      }),
    ])

    // Queue SMS to fundi
    const fundiQueue = require('../queues/fundiQueue')
    await fundiQueue.add('send_acceptance_sms', {
      jobId:      job.id,
      fundiPhone: job.fundiPhone,
      amount:     job.amount.toString(),
      otp,
      expiresAt:  otpExpiry.toISOString(),
    })

    
    await fundiQueue.add(
      'expire_unaccepted',
      { jobId: job.id, buyerId: job.buyerId, amount: job.amount.toString() },
      { delay: 24 * 60 * 60 * 1000, jobId: `expire_${job.id}` }
    )

    await redis.setex(dedupKey, 86400, 'completed')
    logger.info('Fundi payment confirmed — OTP queued', { jobId: job.id })

  } catch (err) {
    logger.error('fundiMpesaCallback failed', { error: err.message, stack: err.stack })
  }
}

// ── Poll payment status ──
const pollFundiPaymentStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params
    const buyerId = req.user.userId

    const mpesaTx = await prisma.fundiMpesaTransaction.findUnique({
      where: { checkoutRequestId },
    })

    if (!mpesaTx) return res.status(404).json({ success: false, message: 'Transaction not found' })

    const job = await prisma.fundiJob.findUnique({ where: { id: mpesaTx.jobId } })
    if (!job || job.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Forbidden' })

    return res.json({
      success: true,
      status:  mpesaTx.status,
      mpesaRef: mpesaTx.mpesaRef,
      jobStatus: job.status,
    })
  } catch (err) {
    logger.error('pollFundiPaymentStatus failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

module.exports = { initiateFundiPayment, fundiMpesaCallback, pollFundiPaymentStatus }
