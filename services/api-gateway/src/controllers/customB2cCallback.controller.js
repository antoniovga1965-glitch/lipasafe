'use strict'
const prisma      = require('../utils/prisma')
const logger      = require('../utils/logger')
const redis       = require('../utils/redis')
const pw = require('../utils/platformWallet')
const customQueue = require('../queues/customQueue')
const smsQueue    = require('../queues/smsQueue')

const ADMIN_PHONE = process.env.ADMIN_PHONE

async function resolveOriginator(originatorConversationID) {
  // ── Layer 1: DB (durable — survives Redis restart/eviction/flush) ──
  try {
    const dbRecord = await prisma.customB2CTransaction.findUnique({
      where: { originatorConversationId: originatorConversationID },
      select: { escrowId: true, type: true },
    })
    if (dbRecord) return { escrowId: dbRecord.escrowId, type: dbRecord.type }
  } catch (dbErr) {
    logger.warn('resolveOriginator: DB lookup failed, falling back to Redis', { error: dbErr.message })
  }

  // ── Layer 2: Redis fallback (fast, but volatile) ──────────────────
  const raw = await redis.get(`custom:b2c:originator:${originatorConversationID}`)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

const customB2cResult = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body = req.body?.Result
    if (!body) return

    const { OriginatorConversationID, ResultCode, TransactionID: mpesaRef } = body
    logger.info('Custom B2C result', { OriginatorConversationID, ResultCode })

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) {
      logger.warn('Custom B2C result: no match', { OriginatorConversationID })
      return
    }

    const { escrowId, type } = match
    const escrow = await prisma.customEscrow.findUnique({ where: { id: escrowId } })
    if (!escrow) {
      logger.warn('Custom B2C result: escrow not found', { escrowId })
      return
    }

    if (Number(ResultCode) === 0) {
      if (type === 'payout') {
        // ── Atomic lock: only one callback wins this UPDATE ───────────
        // Two simultaneous callbacks both see status=RELEASING_FUNDS,
        // but Postgres only lets ONE update succeed. The other gets count=0.
        const grabbed = await prisma.customEscrow.updateMany({
          where: { id: escrowId, status: { in: ['RELEASING_FUNDS', 'PAYMENT_HELD'] } },
          data:  { status: 'COMPLETED', completedAt: new Date() },
        })
        if (grabbed.count === 0) {
          logger.warn('Payout callback: lost race or already completed — skipping', { escrowId })
          return
        }
        // ── Atomic: audit log + platform fee credit in one transaction ──
        // If credit() crashes, audit log also rolls back — no accounting mismatch
        await prisma.$transaction(async (tx) => {
          await tx.customAuditLog.create({
            data: { escrowId, action: 'PAYOUT_CONFIRMED', meta: { mpesaRef } },
          })
          const customFee = Number(escrow.platformFee)
          if (customFee > 0) await pw.credit(tx, customFee, escrowId)
        })

        // SMS outside transaction — notification failure must never roll back money
        try {
          const buyer = await prisma.user.findUnique({ where: { id: escrow.buyerId }, select: { phone: true } })
          await smsQueue.add('send-sms', {
            to:      escrow.counterpartyPhone,
            message: `LipaSafe: KES ${Number(escrow.counterpartyReceives).toFixed(2)} sent to you for deal "${escrow.title}". M-Pesa: ${mpesaRef}`,
          })
          if (buyer) {
            await smsQueue.add('send-sms', {
              to:      buyer.phone,
              message: `LipaSafe: Deal "${escrow.title}" completed. Payment released. Ref: ${mpesaRef}`,
            })
          }
        } catch (smsErr) {
          logger.warn('Payout confirmed SMS failed — payout already done', { escrowId, error: smsErr.message })
        }
        logger.info('Custom B2C payout confirmed', { escrowId, mpesaRef })
      } else {
        // ── Atomic lock: only one callback wins this UPDATE ───────────
        const grabbed = await prisma.customEscrow.updateMany({
          where: { id: escrowId, status: 'REFUNDING' },
          data:  { status: 'REFUNDED' },
        })
        if (grabbed.count === 0) {
          logger.warn('Refund callback: lost race or already refunded — skipping', { escrowId })
          return
        }
        await prisma.customAuditLog.create({
          data: { escrowId, action: 'REFUND_CONFIRMED', meta: { mpesaRef } },
        })
        const buyer = await prisma.user.findUnique({ where: { id: escrow.buyerId }, select: { phone: true } })
        await smsQueue.add('send-sms', {
          to:      buyer.phone,
          message: `LipaSafe: Refund of KES ${Number(escrow.amount).toFixed(2)} sent for deal "${escrow.title}". M-Pesa: ${mpesaRef}`,
        })
        logger.info('Custom B2C refund confirmed', { escrowId, mpesaRef })
      }

      // ── Update DB record status (durable audit trail) ──────────
      await prisma.customB2CTransaction.updateMany({
        where:  { originatorConversationId: OriginatorConversationID },
        data:   { status: 'confirmed', mpesaRef, confirmedAt: new Date() },
      }).catch(err => logger.warn('B2C DB status update failed', { error: err.message }))

      await redis.del(`custom:b2c:originator:${OriginatorConversationID}`)
      await redis.del(`custom:b2c:retry:${type}:${escrowId}`)

    } else {
      const code = Number(ResultCode)

      // ── Permanent failures: retrying will never help ──────────────
      // 2001 = invalid MSISDN / not registered for M-Pesa
      // 2019 = initiator credentials invalid
      // 17   = system internal error (Safaricom-side, needs support ticket)
      // 20   = insufficient org balance (needs manual top-up)
      const PERMANENT_CODES = [2001, 2019, 17, 20]

      // ── Transient failures: safe to retry with backoff ────────────
      // 1    = insufficient receiver funds / temporary network issue
      // 9999 = unknown/timeout — worth one retry
      const RETRYABLE_CODES = [1, 9999]

      const isPermanent = PERMANENT_CODES.includes(code)
      const isRetryable = RETRYABLE_CODES.includes(code)

      logger.warn('Custom B2C failed', { escrowId, type, ResultCode, isPermanent, isRetryable })

      if (isPermanent) {
        // Escalate immediately — no point retrying
        await redis.del(`custom:b2c:originator:${OriginatorConversationID}`)
        await redis.del(`custom:b2c:retry:${type}:${escrowId}`)
        try {
          if (ADMIN_PHONE) {
            await smsQueue.add('send-sms', {
              to:      ADMIN_PHONE,
              message: `LIPASAFE CRITICAL: Custom B2C ${type} PERMANENT failure. Escrow: ${escrowId.slice(0,8).toUpperCase()}. Code: ${ResultCode}. Do NOT retry — manual fix required.`,
            })
          }
        } catch (smsErr) {
          logger.warn('Escalation SMS failed', { escrowId, error: smsErr.message })
        }
        logger.error('Custom B2C permanent failure — escalated immediately', { escrowId, type, ResultCode })

      } else if (isRetryable) {
        // Retry with backoff up to 3 times
        const retryKey   = `custom:b2c:retry:${type}:${escrowId}`
        const retryCount = parseInt(await redis.get(retryKey) || '0', 10)

        if (retryCount < 3) {
          const delays = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
          await redis.set(retryKey, retryCount + 1, 'EX', 86400)
          if (type === 'payout') {
            await customQueue.add('payout_counterparty', {
              escrowId, counterpartyPhone: escrow.counterpartyPhone, amount: escrow.counterpartyReceives.toString(),
            }, { delay: delays[retryCount] })
          } else {
            await customQueue.add('refund_buyer', {
              escrowId, buyerId: escrow.buyerId, amount: escrow.amount.toString(),
            }, { delay: delays[retryCount] })
          }
          logger.warn(`Custom B2C retry ${retryCount + 1}/3 queued`, { escrowId, type, delay: delays[retryCount] })
        } else {
          // Exhausted retries — escalate
          await redis.del(`custom:b2c:originator:${OriginatorConversationID}`)
          await redis.del(`custom:b2c:retry:${type}:${escrowId}`)
          try {
            if (ADMIN_PHONE) {
              await smsQueue.add('send-sms', {
                to:      ADMIN_PHONE,
                message: `LIPASAFE CRITICAL: Custom B2C ${type} failed 3x. Escrow: ${escrowId.slice(0,8).toUpperCase()}. Code: ${ResultCode}. Manual action required.`,
              })
            }
          } catch (smsErr) {
            logger.warn('Escalation SMS failed', { escrowId, error: smsErr.message })
          }
          logger.error('Custom B2C retries exhausted — admin escalated', { escrowId, type, ResultCode })
        }

      } else {
        // Unknown result code — treat as permanent, escalate immediately
        await redis.del(`custom:b2c:originator:${OriginatorConversationID}`)
        await redis.del(`custom:b2c:retry:${type}:${escrowId}`)
        try {
          if (ADMIN_PHONE) {
            await smsQueue.add('send-sms', {
              to:      ADMIN_PHONE,
              message: `LIPASAFE WARNING: Custom B2C ${type} unknown failure. Escrow: ${escrowId.slice(0,8).toUpperCase()}. Code: ${ResultCode}. Manual review required.`,
            })
          }
        } catch (smsErr) {
          logger.warn('Escalation SMS failed', { escrowId, error: smsErr.message })
        }
        logger.error('Custom B2C unknown result code — escalated', { escrowId, type, ResultCode })
      }
    }
  } catch (err) {
    logger.error('customB2cResult error', { err: err.message, stack: err.stack })
  }
}

const customB2cTimeout = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body                     = req.body?.Result
    const OriginatorConversationID = body?.OriginatorConversationID
    if (!OriginatorConversationID) return

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) return

    const { escrowId, type } = match
    if (ADMIN_PHONE) {
      await smsQueue.add('send-sms', {
        to:      ADMIN_PHONE,
        message: `LIPASAFE WARNING: Custom B2C ${type} timeout. Escrow: ${escrowId.slice(0,8).toUpperCase()}. Awaiting reconciliation.`,
      })
    }
    await customQueue.add('reconcile_b2c',
      { escrowId, type, originatorConversationID: OriginatorConversationID },
      {
        delay:  15 * 60 * 1000,
        jobId:  `reconcile:${escrowId}:${type}`,  
      }
    )
    logger.warn('Custom B2C timeout — reconciliation queued', { escrowId, type })
  } catch (err) {
    logger.error('customB2cTimeout error', { err: err.message })
  }
}

module.exports = { customB2cResult, customB2cTimeout }
