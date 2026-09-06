'use strict'
const prisma     = require('../src/utils/prisma')
const logger     = require('../src/utils/logger')
const redis      = require('../src/utils/redis')
const pw = require('../src/utils/platformWallet')
const houseQueue = require('../src/queues/houseQueue')

const ADMIN_PHONE = process.env.ADMIN_PHONE

async function resolveOriginator(originatorConversationID) {
  // O(1) lookup — key written at B2C request time as house:b2c:originator:{id}
  const raw = await redis.get(`house:b2c:originator:${originatorConversationID}`)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return raw }
}

const houseB2cResult = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body = req.body?.Result
    if (!body) return

    const { OriginatorConversationID, ResultCode, TransactionID: mpesaRef } = body
    logger.info('House B2C result — RAW: ' + JSON.stringify(body))

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) {
      logger.warn('House B2C result: no match', { OriginatorConversationID })
      return
    }

    const { escrowId, type } = match
    const escrow = await prisma.houseEscrow.findUnique({ where: { id: escrowId } })
    if (!escrow) {
      logger.warn('House B2C result: escrow not found', { escrowId })
      return
    }

    // Idempotency — skip if already processed
    const expectedAction = type === 'payout' ? 'PAYOUT_CONFIRMED' : 'REFUND_CONFIRMED'
    const alreadyProcessed = await prisma.houseAuditLog.findFirst({
      where: { escrowId, action: expectedAction },
    })
    if (alreadyProcessed) {
      logger.warn('House B2C callback already processed — skipping', { escrowId, type })
      return
    }

    if (Number(ResultCode) === 0) {
      if (type === 'payout') {
        const houseFee = escrow.platformFee ? Number(escrow.platformFee) : Number(escrow.amount) - Number(escrow.sellerReceives || escrow.amount)

        await prisma.$transaction([
          prisma.houseEscrow.update({
            where: { id: escrowId },
            data:  { status: 'COMPLETED', completedAt: new Date() },
          }),
          prisma.houseAuditLog.create({
            data: { escrowId, action: 'PAYOUT_CONFIRMED', meta: { mpesaRef } },
          }),
        ])
        if (houseFee > 0) {
          await pw.credit(prisma, houseFee, escrowId, 'Platform fee from house escrow payout')
        }
        await houseQueue.add('send_raw_sms', {
          phone:   escrow.sellerPhone,
          message: `LipaSafe: Umepokea KES ${Number(escrow.sellerReceives || escrow.amount).toFixed(2)} kwa escrow ${escrowId.slice(0, 8).toUpperCase()}. Mpesa: ${mpesaRef}`,
        })
        await houseQueue.add('send_raw_sms', {
          phone:   escrow.buyerPhone,
          message: `LipaSafe: Malipo yametolewa kwa muuzaji. Shughuli imekamilika. Ref: ${mpesaRef}`,
        })
        const { createAndSend: _pushHP } = require('../src/services/notificationService')
        const _hbv = escrow.buyerPhone.startsWith('254') ? ['0'+escrow.buyerPhone.slice(3), escrow.buyerPhone] : [escrow.buyerPhone, '254'+escrow.buyerPhone.slice(1)]
        const _hsv = escrow.sellerPhone.startsWith('254') ? ['0'+escrow.sellerPhone.slice(3), escrow.sellerPhone] : [escrow.sellerPhone, '254'+escrow.sellerPhone.slice(1)]
        const [_hbu, _hsu] = await Promise.all([
          prisma.user.findFirst({ where: { phone: { in: _hbv } }, select: { id: true } }),
          prisma.user.findFirst({ where: { phone: { in: _hsv } }, select: { id: true } }),
        ])
        if (_hbu) await _pushHP({ userId: _hbu.id, type: 'house_payout_sent', houseEscrowId: escrowId,
          messageEn: `Payment released to seller. Deal complete. Ref: ${mpesaRef}` }).catch(() => {})
        if (_hsu) await _pushHP({ userId: _hsu.id, type: 'house_payout_sent', houseEscrowId: escrowId,
          messageEn: `KES ${Number(escrow.sellerReceives || escrow.amount).toFixed(2)} sent to your M-Pesa. Ref: ${mpesaRef}` }).catch(() => {})
        logger.info('House B2C payout confirmed + fee credited', { escrowId, mpesaRef, houseFee })

      } else {
        await prisma.$transaction([
          prisma.houseEscrow.update({
            where: { id: escrowId },
            data:  { status: 'REFUNDED' },
          }),
          prisma.houseAuditLog.create({
            data: { escrowId, action: 'REFUND_CONFIRMED', meta: { mpesaRef } },
          }),
        ])
        await houseQueue.add('send_raw_sms', {
          phone:   escrow.buyerPhone,
          message: `LipaSafe: Refund ya KES ${Number(escrow.amount).toFixed(2)} imetumwa kwako. Mpesa: ${mpesaRef}`,
        })
        const { createAndSend: _pushHR } = require('../src/services/notificationService')
        const _hrv = escrow.buyerPhone.startsWith('254') ? ['0'+escrow.buyerPhone.slice(3), escrow.buyerPhone] : [escrow.buyerPhone, '254'+escrow.buyerPhone.slice(1)]
        const _hru = await prisma.user.findFirst({ where: { phone: { in: _hrv } }, select: { id: true } })
        if (_hru) await _pushHR({ userId: _hru.id, type: 'refund_sent', houseEscrowId: escrowId,
          messageEn: `Refund of KES ${Number(escrow.amount).toFixed(2)} sent to your M-Pesa. Ref: ${mpesaRef}` }).catch(() => {})
        logger.info('House B2C refund confirmed', { escrowId, mpesaRef })
      }

      await redis.del(`house:b2c:${type}:${escrowId}`)
      await redis.del(`house:b2c:retry:${type}:${escrowId}`)

    } else {
      // Failed — retry with backoff, escalate after 3x
      const retryKey   = `house:b2c:retry:${type}:${escrowId}`
      const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
      logger.warn('House B2C failed', { escrowId, type, ResultCode, attempt: retryCount + 1 })

      if (retryCount < 3) {
        const delays = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
        await redis.set(retryKey, retryCount + 1, 'EX', 86400)
        await redis.del(`house:b2c:${type}:lock:${escrowId}`)

        if (type === 'payout') {
          await houseQueue.add('payout_seller',
            { escrowId, sellerPhone: escrow.sellerPhone, sellerReceives: (escrow.sellerReceives || escrow.amount).toString() },
            { delay: delays[retryCount] }
          )
        } else {
          await houseQueue.add('refund_buyer',
            { escrowId, buyerId: escrow.buyerId, amount: escrow.amount.toString() },
            { delay: delays[retryCount] }
          )
        }
        logger.warn('House B2C retry queued', { escrowId, type, attempt: retryCount + 1 })

      } else {
        await redis.del(`house:b2c:${type}:${escrowId}`)
        await redis.del(`house:b2c:retry:${type}:${escrowId}`)
        if (ADMIN_PHONE) {
          await houseQueue.add('send_raw_sms', {
            phone:   ADMIN_PHONE,
            message: `LIPASAFE CRITICAL: House B2C ${type} failed 3x. Escrow: ${escrowId.slice(0, 8).toUpperCase()}. Code: ${ResultCode}. Manual action required.`,
          })
        }
        logger.error('House B2C failed 3x — admin escalated', { escrowId, type, ResultCode })
      }
    }
  } catch (err) {
    logger.error('houseB2cResult error', { err: err.message, stack: err.stack })
  }
}

const houseB2cTimeout = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body                     = req.body?.Result
    const OriginatorConversationID = body?.OriginatorConversationID
    logger.warn('House B2C timeout', { OriginatorConversationID })
    if (!OriginatorConversationID) return

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) {
      logger.warn('House B2C timeout: no match', { OriginatorConversationID })
      return
    }

    const { escrowId, type } = match
    if (ADMIN_PHONE) {
      await houseQueue.add('send_raw_sms', {
        phone:   ADMIN_PHONE,
        message: `LIPASAFE WARNING: House B2C ${type} timeout. Escrow: ${escrowId.slice(0, 8).toUpperCase()}. Awaiting Safaricom reconciliation.`,
      })
    }
    // Queue reconciliation check after 15 mins
    await houseQueue.add('reconcile_b2c',
      { escrowId, type, originatorConversationID: OriginatorConversationID },
      { delay: 15 * 60 * 1000 }
    )
    logger.warn('House B2C timeout recorded — reconciliation queued', { escrowId, type })
  } catch (err) {
    logger.error('houseB2cTimeout error', { err: err.message, stack: err.stack })
  }
}

module.exports = { houseB2cResult, houseB2cTimeout }
