'use strict'
const crypto = require('crypto')
const { Worker }          = require('bullmq')
const { getToken } = require('../utils/mpesaToken');
const axios               = require('axios')
const Decimal             = require('decimal.js')
const prisma              = require('../utils/prisma')
const redis               = require('../utils/redis')
const logger              = require('../utils/logger')
const { redisConnection } = require('../utils/redis')
const smsQueue             = require('../queues/smsQueue')

const MPESA_BASE_URL  = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET
const B2C_SHORTCODE   = process.env.MPESA_B2C_SHORTCODE || process.env.B2C_SHORTCODE
const B2C_INITIATOR   = process.env.MPESA_B2C_INITIATOR_NAME
const B2C_CREDENTIAL  = process.env.MPESA_B2C_SECURITY_CREDENTIAL
const B2C_RESULT_URL  = process.env.MPESA_CUSTOM_B2C_RESULT_URL
const B2C_TIMEOUT_URL = process.env.MPESA_CUSTOM_B2C_TIMEOUT_URL
const ADMIN_PHONE     = process.env.ADMIN_PHONE

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}


// ── Payout to counterparty ─────────────────────────────────────────────────
async function payoutCounterparty({ escrowId, counterpartyPhone, amount: rawAmount, isPartial = false }) {
  // ── Idempotency: DB check (survives crashes + Redis expiry) ──
  const payoutAlreadyDone = await prisma.customAuditLog.findFirst({
    where: { escrowId, action: { in: ['PAYOUT_INITIATED', 'PAYOUT_CONFIRMED'] } },
  })
  if (payoutAlreadyDone) {
    logger.info('payoutCounterparty: duplicate — skipping', { escrowId })
    return
  }

  const lockKey   = `custom:b2c:payout:lock:${escrowId}`
  const lockValue = crypto.randomUUID()
  const locked    = await redis.set(lockKey, lockValue, 'EX', 300, 'NX')
  if (!locked) { logger.warn('Custom payout already in progress', { escrowId }); return }

  try {
    const amount  = new Decimal(rawAmount).toNearest(1, Decimal.ROUND_HALF_UP).toNumber()
    const phone   = normalizePhone(counterpartyPhone)
    const token   = await getToken()

    const res = await axios.post(`${MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
      InitiatorName:      B2C_INITIATOR,
      SecurityCredential: B2C_CREDENTIAL,
      CommandID:          'BusinessPayment',
      Amount:             amount,
      PartyA:             B2C_SHORTCODE,
      PartyB:             phone,
      Remarks:            `Custom escrow payout ${escrowId.slice(0, 8).toUpperCase()}`,
      QueueTimeOutURL:    B2C_TIMEOUT_URL,
      ResultURL:          B2C_RESULT_URL,
      Occassion:          isPartial ? 'CustomEscrowPartialPayout' : 'CustomEscrowPayout',
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })

    const data = res.data
    if (data.ResponseCode !== '0') throw new Error(data.ResponseDescription || 'B2C payout initiation failed')

    await redis.set(
      `custom:b2c:originator:${data.OriginatorConversationID}`,
      JSON.stringify({ escrowId, type: 'payout' }),
      'EX', 86400
    )
    // ── DB record: durable fallback for resolveOriginator ──────────
    await prisma.customB2CTransaction.create({
      data: {
        escrowId,
        type:                     'payout',
        originatorConversationId: data.OriginatorConversationID,
        amount,
        phone,
        status:                   'pending',
      },
    })
    await prisma.customAuditLog.create({
      data: { escrowId, action: 'PAYOUT_INITIATED', meta: { amount, phone, conversationId: data.OriginatorConversationID } },
    })

    logger.info('Custom B2C payout initiated', { escrowId, amount, phone })
  } finally {
    // Only release OUR lock — prevents Worker A deleting Worker B's lock
    const current = await redis.get(lockKey)
    if (current === lockValue) await redis.del(lockKey)
  }
}

// ── Refund to buyer ────────────────────────────────────────────────────────
async function refundBuyer({ escrowId, buyerId, amount: rawAmount, isPartial = false }) {
  // ── Idempotency: DB check (survives crashes + Redis expiry) ──
  const refundAlreadyDone = await prisma.customAuditLog.findFirst({
    where: { escrowId, action: { in: ['REFUND_INITIATED', 'REFUND_CONFIRMED'] } },
  })
  if (refundAlreadyDone) {
    logger.info('refundBuyer: duplicate — skipping', { escrowId })
    return
  }

  const lockKey   = `custom:b2c:refund:lock:${escrowId}`
  const lockValue = crypto.randomUUID()
  const locked    = await redis.set(lockKey, lockValue, 'EX', 300, 'NX')
  if (!locked) { logger.warn('Custom refund already in progress', { escrowId }); return }

  try {
    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) throw new Error('Buyer not found for refund')

    const amount = new Decimal(rawAmount).toNearest(1, Decimal.ROUND_HALF_UP).toNumber()
    const phone  = normalizePhone(buyer.phone)
    const token  = await getToken()

    const res = await axios.post(`${MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
      InitiatorName:      B2C_INITIATOR,
      SecurityCredential: B2C_CREDENTIAL,
      CommandID:          'BusinessPayment',
      Amount:             amount,
      PartyA:             B2C_SHORTCODE,
      PartyB:             phone,
      Remarks:            `Custom escrow refund ${escrowId.slice(0, 8).toUpperCase()}`,
      QueueTimeOutURL:    B2C_TIMEOUT_URL,
      ResultURL:          B2C_RESULT_URL,
      Occassion:          isPartial ? 'CustomEscrowPartialRefund' : 'CustomEscrowRefund',
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })

    const data = res.data
    if (data.ResponseCode !== '0') throw new Error(data.ResponseDescription || 'B2C refund initiation failed')

    await redis.set(
      `custom:b2c:originator:${data.OriginatorConversationID}`,
      JSON.stringify({ escrowId, type: 'refund' }),
      'EX', 86400
    )
    // ── DB record: durable fallback for resolveOriginator ──────────
    await prisma.customB2CTransaction.create({
      data: {
        escrowId,
        type:                     'refund',
        originatorConversationId: data.OriginatorConversationID,
        amount,
        phone,
        status:                   'pending',
      },
    })
    await prisma.customAuditLog.create({
      data: { escrowId, action: 'REFUND_INITIATED', meta: { amount, phone, conversationId: data.OriginatorConversationID } },
    })

    logger.info('Custom B2C refund initiated', { escrowId, amount, phone })
  } finally {
    // Only release OUR lock — prevents Worker A deleting Worker B's lock
    const current = await redis.get(lockKey)
    if (current === lockValue) await redis.del(lockKey)
  }
}

// ── Reconcile B2C (timeout recovery) ──────────────────────────────────────
async function reconcileB2c({ escrowId, type, originatorConversationID }) {
  logger.warn('Custom B2C reconcile triggered', { escrowId, type, originatorConversationID })
  const escrow = await prisma.customEscrow.findUnique({ where: { id: escrowId } })
  if (!escrow) return

  // Check if already resolved via audit log
  const resolved = await prisma.customAuditLog.findFirst({
    where: { escrowId, action: { in: ['PAYOUT_CONFIRMED', 'REFUND_CONFIRMED'] } },
  })
  if (resolved) { logger.info('Custom B2C reconcile: already resolved', { escrowId }); return }

  // ── SAFE: Never blindly resend B2C — escalate to admin for manual review ──
  // Scenario: Safaricom received the B2C but callback was lost in transit.
  // Re-sending would cause a double payout/refund. Instead:
  // 1. Mark escrow as needing review
  // 2. Alert admin via SMS to manually verify on Safaricom dashboard
  // 3. Admin then triggers payout/refund manually if truly missing

  await prisma.customEscrow.update({
    where: { id: escrowId },
    data:  { status: 'DISPUTED' },
  })

  await prisma.customAuditLog.create({
    data: {
      escrowId,
      action: 'B2C_RECONCILE_ESCALATED',
      meta: {
        type,
        originatorConversationID,
        reason: 'B2C timeout — callback never received. Manual verification required on Safaricom dashboard before resending.',
      },
    },
  })

  // Notify admin — wrapped so SMS failure never blocks this
  try {
    if (ADMIN_PHONE) {
      await smsQueue.add('send-sms', {
        type: "raw",
        to:      ADMIN_PHONE,
        message: `LipaSafe ALERT: B2C ${type} for escrow ${escrowId.slice(0,8).toUpperCase()} timed out. Callback lost. Verify on Safaricom dashboard before manual action. Do NOT resend blindly.`,
      })
    }
  } catch (smsErr) {
    logger.warn('reconcileB2c: admin SMS failed', { escrowId, error: smsErr.message })
  }

  logger.warn('reconcileB2c: escalated to admin — no automatic resend', { escrowId, type, originatorConversationID })
}

// ── STK reconciler — sweeps pending custom payments every 3 minutes ────────
async function reconcileCustomPendingPayments() {
  try {
    if (!prisma.customMpesaTransaction) { logger.warn('Custom reconciler: prisma model not ready'); return }
    const cutoff  = new Date(Date.now() - 2 * 60 * 1000)
    const pending = await prisma.customMpesaTransaction.findMany({
      where:   { status: 'pending', createdAt: { lt: cutoff } },
      include: { escrow: { select: { id: true, status: true, buyerId: true } } },
      take:    10,
    })
    if (!pending.length) return

    logger.info(`Custom reconciler: ${pending.length} pending STK(s) to check`)
    const token = await getToken()

    for (const tx of pending) {
      if (!tx.escrow || tx.escrow.status !== 'PAYMENT_INITIATING') continue
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
          const items    = CallbackMetadata?.Item || []
          const meta     = Object.fromEntries(items.map(i => [i.Name, i.Value]))
          const mpesaRef = meta.MpesaReceiptNumber || `RECON_${Date.now()}`

          await prisma.$transaction([
            prisma.customMpesaTransaction.update({
              where: { id: tx.id },
              data:  { status: 'completed', mpesaRef, processedAt: new Date() },
            }),
            prisma.customEscrow.update({
              where: { id: tx.escrow.id },
              data:  { status: 'PAYMENT_HELD', mpesaRef },
            }),
            prisma.customAuditLog.create({
              data: { escrowId: tx.escrow.id, action: 'PAYMENT_HELD', meta: { mpesaRef, source: 'reconciler' } },
            }),
          ])
          logger.info('Custom reconciler: payment confirmed', { escrowId: tx.escrow.id, mpesaRef })

        } else if (ResultCode === 1032 || ResultCode === '1032') {
          await prisma.customMpesaTransaction.update({ where: { id: tx.id }, data: { status: 'failed', resultDesc: 'Cancelled by user' } })
          await prisma.customEscrow.update({ where: { id: tx.escrow.id }, data: { status: 'ACCEPTED', mpesaCheckoutId: null } })
          logger.info('Custom reconciler: STK cancelled', { escrowId: tx.escrow.id })
        } else {
          logger.info('Custom reconciler: STK still pending', { escrowId: tx.escrow.id, ResultCode })
        }
      } catch (err) {
        logger.warn('Custom reconciler: STK query failed', { escrowId: tx.escrow?.id, error: err.message })
      }
    }
  } catch (err) {
    console.log(err);
    console.error(err)
    console.error('RECONCILER FULL ERROR MESSAGE:', err.message)
    console.error('RECONCILER FULL STACK:', err.stack)
    logger.error('Custom reconciler error', { error: err.message, stack: err.stack })
  }
}

setInterval(reconcileCustomPendingPayments, 3 * 60 * 1000)
setTimeout(reconcileCustomPendingPayments, 30 * 1000)

// ── 45-day auto-delete sweep ───────────────────────────────────────────────
async function deleteExpiredCustomEscrows() {
  try {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    const result = await prisma.customEscrow.deleteMany({
      where: {
        status:    { in: ['COMPLETED', 'REFUNDED', 'CANCELLED', 'REJECTED'] },
        updatedAt: { lt: cutoff },
      },
    })
    if (result.count > 0) logger.info(`Custom auto-delete: removed ${result.count} expired escrows`)
  } catch (err) {
    logger.error('Custom auto-delete error', { error: err.message })
  }
}

// Run once at boot + every 24 hours
setTimeout(deleteExpiredCustomEscrows, 60 * 1000)
setInterval(deleteExpiredCustomEscrows, 24 * 60 * 60 * 1000)

// ── Auto-refund on deadline expiry ────────────────────────────────────────
async function autoRefund({ escrowId }) {
  // Guard 1: fetch current state — admin may have resolved while job was queued
  const escrow = await prisma.customEscrow.findUnique({ where: { id: escrowId } })
  if (!escrow) { logger.warn('auto_refund: escrow not found', { escrowId }); return }

  // Guard 2: only act on PAYMENT_HELD — any other status means deal already settled
  // (COMPLETED = both confirmed, DISPUTED = admin handling it, REFUNDED = already done)
  if (escrow.status !== 'PAYMENT_HELD') {
    logger.info('auto_refund: skipped', { escrowId, status: escrow.status })
    return
  }

  // Guard 3: atomic updateMany lock — if two workers race, only one wins
  const locked = await prisma.customEscrow.updateMany({
    where: { id: escrowId, status: 'PAYMENT_HELD' },
    data:  { status: 'REFUNDING' },
  })
  if (locked.count === 0) {
    logger.warn('auto_refund: lost race condition — another process grabbed it', { escrowId })
    return
  }

  await prisma.customAuditLog.create({
    data: { escrowId, action: 'AUTO_REFUND_TRIGGERED', meta: { reason: 'deadline_expired' } },
  })

  await refundBuyer({ escrowId, buyerId: escrow.buyerId, amount: escrow.amount.toString() })

  // Notify buyer — wrapped so SMS failure never crashes the refund job
  try {
    const buyer = await prisma.user.findUnique({ where: { id: escrow.buyerId }, select: { phone: true } })
    if (buyer) {
      await smsQueue.add('send-sms', {
        type: "raw",
        to:      normalizePhone(buyer.phone),
        message: `LipaSafe: Deal "${escrow.title}" expired with no confirmation. Your KES ${Number(escrow.amount).toFixed(0)} refund is being processed.`,
      })
    }
  } catch (smsErr) {
    logger.warn('autoRefund: buyer SMS failed — refund already initiated, continuing', { escrowId, error: smsErr.message })
  }

  // Notify admin — same guard
  try {
    if (ADMIN_PHONE) {
      await smsQueue.add('send-sms', {
        type: "raw",
        to:      ADMIN_PHONE,
        message: `LipaSafe AUTO-REFUND: Escrow ${escrowId.slice(0,8).toUpperCase()} deadline expired. Refunding KES ${Number(escrow.amount).toFixed(0)} to buyer.`,
      })
    }
  } catch (smsErr) {
    logger.warn('autoRefund: admin SMS failed — continuing', { escrowId, error: smsErr.message })
  }

  logger.info('auto_refund: refund queued', { escrowId, amount: escrow.amount })
}

// ── Dispute seller timeout ────────────────────────────────────────────────
const disputeSellerTimeout = async ({ escrowId }) => {
  const dispute = await prisma.customDispute.findUnique({ where: { escrowId } })
  if (!dispute) return
  if (['RESOLVED', 'SELLER_RESPONDED'].includes(dispute.status)) return // seller responded in time
  // Escalate — mark for admin review
  await prisma.customDispute.update({
    where: { id: dispute.id },
    data:  { status: 'ADMIN_REVIEW' },
  })
  await prisma.customAuditLog.create({
    data: { escrowId, action: 'DISPUTE_SELLER_TIMEOUT', meta: { reason: 'Seller did not respond within 48 hours' } },
  })
  // Notify admin via SMS
  const adminPhone = process.env.ADMIN_PHONE
  try {
    if (adminPhone) {
      await smsQueue.add('send-sms', {
        type: "raw",
        to:      adminPhone,
        message: `LIPASAFE: Seller failed to respond to dispute on escrow ${escrowId.slice(0, 8).toUpperCase()} within 48hrs. Immediate review required.`,
      })
    }
  } catch (smsErr) {
    logger.warn('disputeSellerTimeout: admin SMS failed — dispute still escalated', { escrowId, error: smsErr.message })
  }
  // Notify buyer
  const escrow = await prisma.customEscrow.findUnique({ where: { id: escrowId }, select: { buyerId: true, title: true } })
  if (escrow) {
    const { createAndSend: _n } = require('../services/notificationService')
    _n({ userId: escrow.buyerId, type: 'dispute_escalated', messageEn: `The seller did not respond to your dispute on "${escrow.title}". Admin has been alerted and will resolve shortly.` }).catch(() => {})
  }
  logger.info('Dispute seller timeout escalated', { escrowId })
}

// ── Worker ─────────────────────────────────────────────────────────────────
const customWorker = new Worker('custom', async (job) => {
  logger.info(`Custom worker processing: ${job.name}`, { jobId: job.id, data: job.data })

  switch (job.name) {
    case 'payout_counterparty':
      await payoutCounterparty(job.data)
      break
    case 'refund_buyer':
      await refundBuyer(job.data)
      break
    case 'reconcile_b2c':
      await reconcileB2c(job.data)
      break
    case 'auto_refund':
      await autoRefund(job.data)
      break
    case 'dispute_seller_timeout':
      await disputeSellerTimeout(job.data)
      break
    default:
      logger.warn('Custom worker: unknown job', { name: job.name })
  }
}, {
  connection: redisConnection,
  concurrency: 5,
})

customWorker.on('completed', (job) => {
  logger.info(`Custom job completed: ${job.name}`, { jobId: job.id })
})

customWorker.on('failed', (job, err) => {
  logger.error(`Custom job failed: ${job?.name}`, { jobId: job?.id, error: err.message })
})

logger.info('Custom escrow worker started')
module.exports = customWorker

// ── 30-day auto-purge ─────────────────────────────────────────────────────────
const { CronJob } = require('cron');
const PURGEABLE = ['PENDING_ACCEPTANCE','REJECTED','CANCELLED','COMPLETED','REFUNDED'];

new CronJob('0 3 * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await prisma.customEscrow.updateMany({
      where: {
        status:    { in: PURGEABLE },
        deletedAt: null,
        createdAt: { lt: cutoff },
      },
      data: { deletedAt: new Date() },
    });
    if (count > 0) logger.info(`Auto-purged ${count} old custom escrows`);
  } catch (err) {
    logger.error('Auto-purge failed', { error: err.message });
  }
}, null, true);

