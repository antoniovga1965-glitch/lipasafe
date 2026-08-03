'use strict'
const { Worker } = require('bullmq')
const logger = require('../utils/logger')
const AfricasTalking = require('africastalking')

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
})

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

const sendSMS = async (phone, message) => {
  if (!phone || phone.startsWith('till_')) {
    logger.warn('sendSMS skipped — ghost phone', { phone })
    return
  }
  let normalized = phone.replace(/\s/g, '')
  if (normalized.startsWith('0'))      normalized = '254' + normalized.slice(1)
  if (normalized.startsWith('+'))      normalized = normalized.slice(1)
  if (!/^254\d{9}$/.test(normalized)) {
    logger.warn('sendSMS skipped — invalid phone', { phone })
    return
  }
  const to = `+${normalized}`
  const isSandbox = process.env.AT_ENVIRONMENT === 'sandbox'

  const payload = { to: [to], message }
  if (!isSandbox) payload.from = 'LipaSafe' 

  const result = await at.SMS.send(payload)
  logger.info('AT SMS sent', { to, result: result.SMSMessageData })
}

const worker = new Worker('sms', async (job) => {
  const { amount, isGhost, senderPhone, type } = job.data
  const phone = job.data.phone || job.data.to  

  const message =
    type === 'bundle_seller_notify_till'
    ? `LipaSafe: New order via Till ${job.data.sellerTill}. Deliver bundles to ${job.data.buyerPhone}. Amount: KES ${job.data.amount}. Ref: ${job.data.referenceNo}. Open LipaSafe to confirm dispatch.`
    : type === 'bundle_seller_notify'
    ? `LipaSafe: You have a new order. Deliver bundles to ${job.data.buyerPhone}. Amount: KES ${job.data.amount}. Ref: ${job.data.referenceNo}. Open LipaSafe to confirm.`
    : type === 'bundle_buyer_confirm'
    ? `LipaSafe: Did you receive your bundles? Open the app to confirm (Ref: ${job.data.referenceNo}). Funds auto-release in 1 hour if no response.`
    : type === 'bundle_released_seller_till'
    ? `LipaSafe: KES ${job.data.amount} payment confirmed for Till ${job.data.sellerTill}. Ref: ${job.data.referenceNo}. Release complete.`
    : type === 'bundle_released_seller'
    ? `LipaSafe: KES ${job.data.amount} has been sent to your M-Pesa. Ref: ${job.data.referenceNo}.`
    : type === 'bundle_released_buyer'
    ? `LipaSafe: Transaction complete. Ref: ${job.data.referenceNo}. Thank you for using LipaSafe.`
    : type === 'bundle_refunded'
    ? `LipaSafe: Your KES ${job.data.amount} has been refunded. Ref: ${job.data.referenceNo}.`
    : type === 'bundle_otp'
    ? `LipaSafe: Your OTP is ${job.data.otp}. Enter it in the app to confirm delivery. Ref: ${job.data.referenceNo}. Valid for 1 hour.`
    : type === 'delivery_reminder'
    ? `LipaSafe Reminder: You have a pending delivery. Ref: ${job.data.referenceNo} – KES ${job.data.amount}. Deliver now to avoid cancellation.`
    : type === 'ghost'
    ? `You received KES ${amount} on LipaSafe from ${senderPhone}. Download the app to claim your money before it expires. https://lipasafe.app`
    : type === 'second_hand_released_seller'
    ? `LipaSafe: KES ${job.data.amount} has been sent to your M-Pesa. Second-hand transaction complete.`
    : type === 'second_hand_released_buyer'
    ? `LipaSafe: Transaction complete. Funds have been released to the seller. Thank you for using LipaSafe.`
    : `You received KES ${amount} from ${senderPhone} on LipaSafe. Check your wallet now.`

  // raw type — message already fully formed (inbound SMS replies)
  const finalMessage = type === 'raw' ? job.data.message
    : type === 'bundle_otp_sms_reply'
    ? `LipaSafe: Seller has delivered. Reply: OTP ${job.data.otp} ${job.data.referenceNo} to release KES ${job.data.amount}. Valid 1hr.`
    : message
  await sendSMS(phone, finalMessage)
  logger.info('SMS job completed', { jobId: job.id, phone })
}, {
  connection,
  concurrency: 5,
})

worker.on('completed', (job) => logger.info('SMS worker completed job', { jobId: job.id }))
worker.on('failed',    (job, err) => { console.error('SMS FULL ERROR:', err.message, err.response?.body || err.stack); logger.error('SMS worker job failed', { jobId: job.id, err: err.message, attempts: job.attemptsMade }) })
worker.on('error',     (err) => logger.error('SMS worker error', { err: err.message }))

logger.info('SMS worker started')
module.exports = worker
