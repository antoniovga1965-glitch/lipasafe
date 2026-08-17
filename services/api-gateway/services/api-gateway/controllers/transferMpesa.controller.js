'use strict'
const axios             = require('axios')
const { getToken }      = require('../src/utils/mpesaToken')
const prisma            = require('../src/utils/prisma')
const redis             = require('../src/utils/redis')
const logger            = require('../src/utils/logger')
const { createAndSend } = require('../src/services/notificationService')
const { Queue }         = require('bullmq')
const Decimal           = require('decimal.js')
const { calcFeesInstantSend } = require('../src/utils/feeCalculator')
const { z }             = require('zod')
const crypto            = require('crypto')
const smsQueue          = require('../src/queues/smsQueue')

const transferQueue  = new Queue('protectedTransfer', { connection: redis })
const MPESA_BASE_URL = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const SHORTCODE      = process.env.MPESA_SHORTCODE
const PASSKEY        = process.env.MPESA_PASSKEY
const CALLBACK_URL   = process.env.MPESA_TRANSFER_CALLBACK_URL

const normalizePhone = (p) => {
  p = p.toString().replace(/\s+/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0'))   return '254' + p.slice(1)
  if (p.startsWith('+'))   return p.slice(1)
  return p
}

const generateClaimCode = () =>
  crypto.randomBytes(3).toString('hex').toUpperCase()

// ── Initiate SafeSend ─────────────────────────────────────────────────────
const initiateSafeSend = async (req, res) => {
  const schema = z.object({
    recipientPhone: z.string().min(9).max(13),
    amount:         z.number().positive().min(10),
    purpose:        z.enum(['RENT','PURCHASE','SALARY','SCHOOL_FEES','LOAN','GIFT','OTHER']).default('OTHER'),
    description:    z.string().max(200).optional()
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
  }

  const { recipientPhone, amount, purpose, description } = parsed.data
  const senderId = req.user.userId

  try {
    const sender = await prisma.user.findUnique({
      where:  { id: senderId },
      select: { phone: true, fullName: true }
    })
    if (!sender) return res.status(404).json({ success: false, message: 'Sender not found' })

    const normalizedRecipient = normalizePhone(recipientPhone)
    const normalizedSender    = normalizePhone(sender.phone)

    if (!/^254\d{9}$/.test(normalizedRecipient)) {
      return res.status(400).json({ success: false, message: 'Invalid recipient phone number. Use format 07XXXXXXXX or 254XXXXXXXXX.' })
    }

    if (normalizedRecipient === normalizedSender) {
      return res.status(400).json({ success: false, message: 'Cannot send to yourself' })
    }

    
    const dedupKey = `transfer:stk:dedup:${senderId}`
    const acquired = await redis.set(dedupKey, '1', 'EX', 60, 'NX')
    if (!acquired) {
      return res.status(429).json({ success: false, message: 'A SafeSend is already in progress. Wait a moment.' })
    }

    const { platformFee, b2cCharge, totalDeduct } = calcFeesInstantSend(amount)
    const totalSTK = totalDeduct.toNumber()

    let stkRes
    try {
      const token     = await getToken()
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
      const password  = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64')

      stkRes = await axios.post(
        `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: SHORTCODE,
          Password:          password,
          Timestamp:         timestamp,
          TransactionType:   'CustomerPayBillOnline',
          Amount:            totalSTK,
          PartyA:            normalizedSender,
          PartyB:            SHORTCODE,
          PhoneNumber:       normalizedSender,
          CallBackURL:       CALLBACK_URL,
          AccountReference:  'LipaSafe SafeSend',
          TransactionDesc:   `SafeSend to ${normalizedRecipient}`
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      )
    } catch (stkErr) {
    
      await redis.del(dedupKey)
      throw stkErr
    }

    if (stkRes.data.ResponseCode !== '0') {
      
      await redis.del(dedupKey)
      return res.status(502).json({ success: false, message: stkRes.data.ResponseDescription || 'STK push failed' })
    }

    const checkoutId = stkRes.data.CheckoutRequestID
    const claimCode  = generateClaimCode()

    await redis.set(
      `transfer:stk:${checkoutId}`,
      JSON.stringify({
        senderId,
        senderPhone:    normalizedSender,
        senderName:     sender.fullName,
        recipientPhone: normalizedRecipient,
        amount:         amount.toString(),
        platformFee:    platformFee.toString(),
        b2cCharge:      b2cCharge.toString(),
        purpose,
        description:    description ?? '',
        claimCode
      }),
      'EX', 600
    )

    // DB write — durable fallback if Redis dies before callback arrives
    await prisma.stkPushLog.create({
      data: {
        checkoutId,
        context: {
          senderId,
          senderPhone:    normalizedSender,
          senderName:     sender.fullName,
          recipientPhone: normalizedRecipient,
          amount:         amount.toString(),
          platformFee:    platformFee.toString(),
          b2cCharge:      b2cCharge.toString(),
          purpose,
          description:    description ?? '',
          claimCode
        }
      }
    })

    logger.info('SafeSend STK initiated', { senderId, checkoutId, totalSTK })
    return res.json({
      success:           true,
      message:           'STK push sent. Enter your M-Pesa PIN to confirm.',
      checkoutRequestId: checkoutId
    })
  } catch (err) {
    logger.error('initiateSafeSend error', { err: err.message, response: err.response?.data })
    return res.status(500).json({ success: false, message: 'Failed to initiate SafeSend' })
  }
}

// ── STK Callback ──────────────────────────────────────────────────────────
const safeSendCallback = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })

  try {
    const body = req.body?.Body?.stkCallback
    if (!body) return

    const checkoutId = body.CheckoutRequestID
    
    // strict !== 0 would miss the string case, so coerce to Number first
    const resultCode = Number(body.ResultCode)

    const raw = await redis.get(`transfer:stk:${checkoutId}`)
    let ctx
    if (raw) {
      ctx = JSON.parse(raw)
    } else {
      // Redis miss — recover from DB (guards against Redis restart between STK and callback)
      const log = await prisma.stkPushLog.findUnique({ where: { checkoutId } })
      if (!log) {
        logger.error('SafeSend callback — no context in Redis or DB, money may be lost', { checkoutId })
        return
      }
      ctx = log.context
      logger.warn('SafeSend callback — Redis miss, recovered from DB', { checkoutId })
    }

    if (resultCode !== 0) {
      logger.info('SafeSend STK failed/cancelled', { checkoutId, resultCode })
      await redis.del(`transfer:stk:${checkoutId}`)
      await redis.del(`transfer:stk:dedup:${ctx.senderId}`)
      createAndSend({
        userId:    ctx.senderId,
        type:      'transfer_failed',
        messageEn: `Your SafeSend of KES ${ctx.amount} was cancelled or failed. No money was deducted.`,
        messageSw: null,
        channel:   'push'
      }).catch(e => logger.warn('STK fail notify error', { err: e.message }))
      return
    }
    const items    = body.CallbackMetadata?.Item || []
    const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value

    
    // Without this, a retry creates a second ProtectedTransfer for the same checkout
    const existing = await prisma.protectedTransfer.findUnique({
      where:  { stkCheckoutId: checkoutId },
      select: { id: true }
    })
    if (existing) {
      logger.warn('SafeSend callback duplicate — transfer already exists', { checkoutId, transferId: existing.id })
      await redis.del(`transfer:stk:${checkoutId}`)
      await redis.del(`transfer:stk:dedup:${ctx.senderId}`)
      return
    }

    const recipient = await prisma.user.findUnique({
      where:  { phone: ctx.recipientPhone },
      select: { id: true }
    })

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    let transfer
    try {
      transfer = await prisma.protectedTransfer.create({
        data: {
          senderId:       ctx.senderId,
          recipientPhone: ctx.recipientPhone,
          recipientId:    recipient?.id ?? null,
          amount:         new Decimal(ctx.amount),
          platformFee:    new Decimal(ctx.platformFee),
          b2cCharge:      new Decimal(ctx.b2cCharge),
          purpose:        ctx.purpose,
          description:    ctx.description,
          state:          'PENDING',
          mpesaRef:       mpesaRef ?? null,
          stkCheckoutId:  checkoutId,
          claimCode:      ctx.claimCode,
          expiresAt
        }
      })
    } catch (e) {
      // P2002 = unique constraint violation — parallel worker already created this transfer
      if (e.code === 'P2002' && e.meta?.target?.includes('stkCheckoutId')) {
        logger.warn('safeSendCallback: duplicate create blocked by DB constraint', { checkoutId })
        await redis.del(`transfer:stk:${checkoutId}`)
        await redis.del(`transfer:stk:dedup:${ctx.senderId}`)
        return
      }
      throw e
    }

    await redis.del(`transfer:stk:${checkoutId}`)
    await redis.del(`transfer:stk:dedup:${ctx.senderId}`)
    // best-effort cleanup — StkPushLog only needed until transfer is created
    await prisma.stkPushLog.delete({ where: { checkoutId } }).catch(e =>
      logger.warn('StkPushLog cleanup failed (non-critical)', { err: e.message })
    )

    // non-fatal — reconciler re-enqueues any missed jobs
    try {
      await transferQueue.add(
        'expire-transfer',
        { transferId: transfer.id },
        { jobId: `expire-${transfer.id}`, delay: 7 * 24 * 60 * 60 * 1000 }
      )
    } catch (qErr) {
      logger.error('transferQueue.add failed — reconciler will catch this', {
        transferId: transfer.id, err: qErr.message
      })
    }

    if (recipient) {
      createAndSend({
        userId:     recipient.id,
        type:       'transfer_received',
        messageEn:  `Incoming KES ${ctx.amount} from ${ctx.senderName}`,
        messageSw:  null,
        transferId: transfer.id,
        channel:    'push'
      }).catch(e => logger.warn('Recipient push notify failed', { err: e.message }))
    } else {
      
      const smsBody = `${ctx.senderName} sent you KES ${ctx.amount} via LipaSafe for "${ctx.description}". Download LipaSafe and use code ${ctx.claimCode} to claim. Expires in 7 days.`
      smsQueue.add('safesend_notify_unregistered', {
        to:      ctx.recipientPhone,
        message: smsBody
      }).catch(e => logger.warn('SafeSend SMS to unregistered recipient failed', { err: e.message }))
      logger.info('SafeSend SMS queued for unregistered recipient', { recipientPhone: ctx.recipientPhone, claimCode: ctx.claimCode })
    }

    createAndSend({
      userId:     ctx.senderId,
      type:       'transfer_sent',
      messageEn:  `Your KES ${ctx.amount} SafeSend to ${ctx.recipientPhone} is held safely. They have 7 days to accept.`,
      messageSw:  null,
      transferId: transfer.id,
      channel:    'push'
    }).catch(e => logger.warn('Sender confirm notify failed', { err: e.message }))

    logger.info('ProtectedTransfer created', { transferId: transfer.id, claimCode: ctx.claimCode })
  } catch (err) {
    logger.error('safeSendCallback error', { err: err.message })
  }
}

// ── STK Status Poll ───────────────────────────────────────────────────────
const safeSendStatus = async (req, res) => {
  const { checkoutId } = req.params
  try {
    const pending = await redis.get(`transfer:stk:${checkoutId}`)
    if (pending) return res.json({ status: 'pending' })

    const transfer = await prisma.protectedTransfer.findFirst({
      where:  { stkCheckoutId: checkoutId },
      select: { id: true, state: true }
    })
    if (transfer) return res.json({ status: 'completed', transferId: transfer.id })

    return res.json({ status: 'failed' })
  } catch (err) {
    logger.error('safeSendStatus error', { err: err.message })
    return res.status(500).json({ status: 'error' })
  }
}

module.exports = { initiateSafeSend, safeSendCallback, safeSendStatus }