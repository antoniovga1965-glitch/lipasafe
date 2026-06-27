'use strict'
const { Worker } = require('bullmq')
const { getToken } = require('../utils/mpesaToken');
const axios      = require('axios')
const Decimal    = require('decimal.js')
const prisma     = require('../utils/prisma')
const redis      = require('../utils/redis')
const logger     = require('../utils/logger')
const { redisConnection }   = require('../utils/redis')
const { createAndSend }     = require('../services/notificationService')

const MPESA_BASE_URL     = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY       = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET    = process.env.MPESA_CONSUMER_SECRET
const B2C_SHORTCODE      = process.env.MPESA_B2C_SHORTCODE || process.env.B2C_SHORTCODE
const B2C_INITIATOR      = process.env.MPESA_B2C_INITIATOR_NAME
const { getB2CCredential } = require('../utils/mpesaCredential')
const B2C_CREDENTIAL     = getB2CCredential()
const B2C_RESULT_URL     = process.env.MPESA_HOUSE_B2C_RESULT_URL
const B2C_TIMEOUT_URL    = process.env.MPESA_HOUSE_B2C_TIMEOUT_URL
const ADMIN_PHONE        = process.env.ADMIN_PHONE
const SMS_USERNAME       = process.env.AT_USERNAME
const SMS_URL            = process.env.SMS_API_URL
const SMS_API_KEY        = process.env.SMS_API_KEY
const SMS_SENDER_ID      = process.env.SMS_SENDER_ID || 'LipaSafe'

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}


// ── Send SMS ───────────────────────────────────────────────────────────────
async function sendSms(phone, message) {
  if (!SMS_URL || !SMS_API_KEY) {
    logger.warn('SMS not configured — skipping', { phone, message })
    return
  }
  try {
    const params = new URLSearchParams()
    params.append('username',  SMS_USERNAME)
    params.append('sender_id', SMS_SENDER_ID)
    params.append('message',   message)
    params.append('to',        normalizePhone(phone))
    await axios.post(SMS_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey':       SMS_API_KEY,
      },
      timeout: 10000,
    })
    logger.info('SMS sent', { phone })
  } catch (err) {
    logger.error('SMS failed', {
      phone,
      error:    err.message,
      status:   err.response?.status,
      response: err.response?.data,
    })
    throw err
  }
}

// ── B2C payout to seller ───────────────────────────────────────────────────
async function payoutSeller({ escrowId, sellerPhone, sellerReceives }) {
  const lockKey = `house:b2c:payout:lock:${escrowId}`
  const locked  = await redis.set(lockKey, '1', 'EX', 300, 'NX')
  if (!locked) { logger.warn('House payout already in progress', { escrowId }); return }

  try {
    const amount = new Decimal(sellerReceives).toNearest(1, Decimal.ROUND_HALF_UP).toNumber()
    const phone  = normalizePhone(sellerPhone)

    if (!phone) {
      logger.error('House payout aborted — invalid seller phone', { escrowId, sellerPhone })
      await prisma.houseEscrow.update({ where: { id: escrowId }, data: { status: 'DISPUTED' } })
      await prisma.houseAuditLog.create({
        data: { escrowId, action: 'PAYOUT_FAILED', meta: { reason: 'invalid_phone', sellerPhone } }
      })
      return
    }

    const token        = await getToken()
    const originatorId = `lipasafe-${escrowId.slice(0, 8)}-${Date.now()}`

    const res = await axios.post(`${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`, {
      OriginatorConversationID: originatorId,
      InitiatorName:            B2C_INITIATOR,
      SecurityCredential:       B2C_CREDENTIAL,
      CommandID:                'BusinessPayment',
      Amount:                   amount,
      PartyA:                   B2C_SHORTCODE,
      PartyB:                   phone,
      Remarks:                  `House escrow payout ${escrowId.slice(0, 8).toUpperCase()}`,
      QueueTimeOutURL:          B2C_TIMEOUT_URL,
      ResultURL:                B2C_RESULT_URL,
      Occassion:                'HouseEscrowPayout',
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })

    const data = res.data
    if (data.ResponseCode !== '0') {
      logger.error('B2C initiation rejected', { data })
      throw new Error(data.ResponseDescription || 'B2C initiation failed')
    }

    await redis.set(
      `house:b2c:originator:${data.OriginatorConversationID}`,
      JSON.stringify({ escrowId, type: 'payout' }),
      'EX', 86400
    )
    await prisma.houseAuditLog.create({
      data: { escrowId, action: 'PAYOUT_INITIATED', meta: { amount, phone, conversationId: data.OriginatorConversationID } },
    })

    logger.info('House B2C payout initiated', { escrowId, amount, phone })

  } catch (err) {
    if (err.response) {
      logger.error('B2C 400 error', { status: err.response.status, data: err.response.data })
    } else {
      logger.error('B2C network error', { msg: err.message })
    }
    throw err
  } finally {
    await redis.del(lockKey)
  }
}

// ── B2C refund to buyer ────────────────────────────────────────────────────
async function refundBuyer({ escrowId, buyerId, amount: rawAmount }) {
  const lockKey = `house:b2c:refund:lock:${escrowId}`
  const locked  = await redis.set(lockKey, '1', 'EX', 300, 'NX')
  if (!locked) { logger.warn('House refund already in progress', { escrowId }); return }

  try {
    const buyer  = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) throw new Error('Buyer not found for refund')

    const amount = new Decimal(rawAmount).toNearest(1, Decimal.ROUND_HALF_UP).toNumber()
    const phone  = normalizePhone(buyer.phone)
    const token  = await getToken()

    console.error("B2C_URL:", `${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`, "SHORTCODE:", B2C_SHORTCODE, "INITIATOR:", B2C_INITIATOR, "CRED_LEN:", B2C_CREDENTIAL?.length);
    const originatorId = `lipasafe-${escrowId.slice(0,8)}-${Date.now()}`;
    const res = await axios.post(`${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`, {
      OriginatorConversationID: originatorId,
      InitiatorName:      B2C_INITIATOR,
      SecurityCredential: B2C_CREDENTIAL,
      CommandID:          'BusinessPayment',
      Amount:             amount,
      PartyA:             B2C_SHORTCODE,
      PartyB:             phone,
      Remarks:            `House escrow refund ${escrowId.slice(0, 8).toUpperCase()}`,
      QueueTimeOutURL:    B2C_TIMEOUT_URL,
      ResultURL:          B2C_RESULT_URL,
      Occassion:          'HouseEscrowRefund',
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })

    const data = res.data
    if (data.ResponseCode !== '0') throw new Error(data.ResponseDescription || 'B2C refund initiation failed')

    await redis.set(`house:b2c:originator:${data.OriginatorConversationID}`, JSON.stringify({ escrowId, type: 'refund' }), 'EX', 86400)
    await prisma.houseAuditLog.create({
      data: { escrowId, action: 'REFUND_INITIATED', meta: { amount, phone, conversationId: data.OriginatorConversationID } },
    })

    logger.info('House B2C refund initiated', { escrowId, amount, phone })
  } finally {
    await redis.del(lockKey)
  }
}

// ── Auto-release on inspection deadline ───────────────────────────────────
async function autoRelease({ escrowId, sellerPhone, sellerReceives }) {
  const escrow = await prisma.houseEscrow.findUnique({ where: { id: escrowId } })
  if (!escrow) { logger.warn('Auto-release: escrow not found', { escrowId }); return }
  if (escrow.status !== 'PAYMENT_HELD') {
    logger.info('Auto-release skipped — escrow already resolved', { escrowId, status: escrow.status })
    return
  }

  await prisma.$transaction([
    prisma.houseEscrow.update({
      where: { id: escrowId },
      data:  { status: 'AUTO_RELEASED', autoReleasedAt: new Date() },
    }),
    prisma.houseAuditLog.create({
      data: { escrowId, action: 'AUTO_RELEASED', meta: { reason: 'inspection_window_expired' } },
    }),
  ])

  logger.info('House escrow auto-released — initiating payout', { escrowId })
  await payoutSeller({ escrowId, sellerPhone, sellerReceives })
}

// ── Worker ─────────────────────────────────────────────────────────────────
const houseWorker = new Worker('house', async (job) => {
  logger.info(`House worker processing: ${job.name}`, { jobId: job.id, data: job.data })

  switch (job.name) {
    case 'payout_seller':
      await payoutSeller(job.data)
      break

    case 'refund_buyer':
      await refundBuyer(job.data)
      break

    case 'auto_release':
      await autoRelease(job.data)
      break

    case 'send_raw_sms':
      await sendSms(job.data.phone, job.data.message)
      break

    default:
      logger.warn('House worker: unknown job', { name: job.name })
  }
}, {
  connection: redisConnection,
  concurrency: 5,
})

houseWorker.on('completed', (job) => {
  logger.info(`House job completed: ${job.name}`, { jobId: job.id })
})

houseWorker.on('failed', (job, err) => {
  logger.error(`House job failed: ${job?.name}`, { jobId: job?.id, error: err.message })
  if (ADMIN_PHONE && ['payout_seller', 'refund_buyer'].includes(job?.name)) {
    sendSms(ADMIN_PHONE, `LIPASAFE: House worker job ${job.name} failed. Escrow: ${job.data?.escrowId?.slice(0,8).toUpperCase()}. Error: ${err.message.slice(0,80)}`).catch(() => {})
  }
})

// ── STK reconciler — sweeps pending house payments every 3 minutes ─────────
async function reconcileHousePendingPayments() {
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000) // older than 2 min
    const pending = await prisma.houseMpesaTransaction.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      include: { escrow: { select: { id: true, status: true, buyerId: true, inspectionHours: true, sellerPhone: true, sellerReceives: true, amount: true } } },
      take: 10,
    })

    if (!pending.length) return

    logger.info(`House reconciler: ${pending.length} pending STK(s) to check`)

    const token = await getToken()

    for (const tx of pending) {
      if (!tx.escrow || tx.escrow.status !== 'PENDING_PAYMENT') continue

      try {
        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)
        const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64')

        const res = await axios.post(
          `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
          {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Password:          password,
            Timestamp:         timestamp,
            CheckoutRequestID: tx.checkoutRequestId,
          },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
        )

        const { ResultCode, CallbackMetadata } = res.data
        if (ResultCode === 0 || ResultCode === '0') {
          // Payment confirmed — extract receipt
          const items   = CallbackMetadata?.Item || []
          const meta    = Object.fromEntries(items.map(i => [i.Name, i.Value]))
          const mpesaRef = meta.MpesaReceiptNumber || `RECON_${Date.now()}`

          const safeHours = Math.min(Math.max(tx.escrow.inspectionHours || 24, 1), 168)
          const inspectionDeadline = new Date(Date.now() + safeHours * 60 * 60 * 1000)

          await prisma.$transaction([
            prisma.houseMpesaTransaction.update({
              where: { id: tx.id },
              data:  { status: 'completed', mpesaRef, processedAt: new Date() },
            }),
            prisma.houseEscrow.update({
              where: { id: tx.escrow.id },
              data:  { status: 'PAYMENT_HELD', mpesaRef, inspectionDeadline },
            }),
            prisma.houseAuditLog.create({
              data: { escrowId: tx.escrow.id, action: 'PAYMENT_HELD', meta: { mpesaRef, source: 'reconciler' } },
            }),
          ])

          logger.info('House reconciler: payment confirmed', { escrowId: tx.escrow.id, mpesaRef })

          await createAndSend({
            userId: tx.escrow.buyerId,
            type:   'house_payment_held',
            messageEn: 'Your house escrow payment was confirmed. Inspection window is now open.',
            houseEscrowId: tx.escrow.id,
          }).catch((e) => logger.error('House buyer notification failed', { error: e.message }))
          try {
            const houseQueue = require('../queues/houseQueue')
            await houseQueue.add(
              'auto_release',
              {
                escrowId:       tx.escrow.id,
                sellerPhone:    tx.escrow.sellerPhone,
                sellerReceives: tx.escrow.sellerReceives?.toString() || tx.escrow.amount.toString(),
              },
              { delay: safeHours * 60 * 60 * 1000, jobId: `auto_release_${tx.escrow.id}` }
            )
            logger.info('House reconciler: auto_release scheduled', { escrowId: tx.escrow.id, safeHours })
          } catch (queueErr) {
            logger.error('House reconciler: auto_release scheduling failed', { escrowId: tx.escrow.id, error: queueErr.message })
          }

        } else if (ResultCode === 1032 || ResultCode === '1032') {
          // Cancelled by user
          await prisma.houseMpesaTransaction.update({ where: { id: tx.id }, data: { status: 'failed', resultDesc: 'Cancelled by user' } })
          await prisma.houseEscrow.update({ where: { id: tx.escrow.id }, data: { status: 'CANCELLED' } })
          logger.info('House reconciler: STK cancelled', { escrowId: tx.escrow.id })
        } else {
          logger.info('House reconciler: STK still pending or failed', { escrowId: tx.escrow.id, ResultCode })
        }
      } catch (err) {
        console.error(err)
        logger.warn('House reconciler: STK query failed', { escrowId: tx.escrow?.id, error: err.message })
      }
    }
  } catch (err) {
    console.error(err)
    logger.error('House reconciler error', { error: err.message })
  }
}

// Run every 3 minutes
setInterval(reconcileHousePendingPayments, 10 * 60 * 1000)
// Also run once on boot after 30s
setTimeout(reconcileHousePendingPayments, 2 * 60 * 1000)
logger.info('House STK reconciler started')

module.exports = houseWorker
