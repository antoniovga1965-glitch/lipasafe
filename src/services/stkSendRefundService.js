'use strict'
const prisma   = require('../utils/prisma')
const logger   = require('../utils/logger')
const redis    = require('../utils/redis')
const Decimal  = require('decimal.js')
const { createAndSend } = require('./notificationService')

// Refunds a sender whose STK-funded Instant Send failed during the recipient B2C payout.
// Throws on a retryable failure (e.g. initiateB2C/Safaricom error) so the caller can schedule a retry.
// Returns silently (no throw) when there's nothing left todo — already refunded, or context lost.
const stkSendRefund = async (reference, { mpesaRef, resultCode, resultDesc } = {}) => {
  const refundKey  = `b2c_refund:${reference}`
  const refundData = await redis.get(refundKey)

  if (!refundData) {
    logger.warn('stkSendRefund: no refund context found — already handled or context lost', { reference })
    return
  }

  const refundCtx   = JSON.parse(refundData)
  const totalDeduct = new Decimal(refundCtx.totalDeduct)
  const refundAmount = new Decimal(refundCtx.amount ?? refundCtx.totalDeduct)
  const { initiateB2C } = require('../utils/mpesaB2C')

  const originatorId = `refund-${reference}`

  // Register the originator ID BEFORE firing B2C so the result callback can find it
  await redis.set(`originator:${originatorId}`, `stk_refund:${reference}`, 'EX', 86400)

  // initiateB2C is allowed to throw here — caller decides whether to retry
  await initiateB2C({
    phone:         refundCtx.senderPhone,
    amount:        refundAmount.toNumber(),
    originatorId,
    transactionId: originatorId,
    remarks:       `LipaSafe send refund ${reference}`,
  })

  await prisma.walletTransaction.updateMany({
    where: { reference },
    data:  { status: 'failed' },
  })

  await prisma.auditLog.create({
    data: {
      actorId:    null,
      actorType:  'system',
      action:     'stk_send_b2c_failed_refunded',
      entityType: 'WalletTransaction',
      entityId:   reference,
      amount:     refundAmount.toFixed(2),
      metadata:   { resultCode, resultDesc, mpesaRef, reference, senderPhone: refundCtx.senderPhone },
    },
  })

  await redis.del(refundKey)
  logger.info('stkSendRefund: sender refunded via M-Pesa', { reference, refundAmount: refundAmount.toFixed(2) })

  try {
    if (refundCtx.senderId) {
      await createAndSend({
        userId:        refundCtx.senderId,
        type:          'money_sent',
        transactionId: null,
        messageEn:     `Your Instant Send of KES ${refundAmount.toFixed(2)} failed and has been refunded to your M-Pesa. Ref: ${reference}`,
      })
    }
  } catch (notifErr) {
    logger.error('stkSendRefund: sender notification failed', { reference, err: notifErr.message })
  }
}

module.exports = { stkSendRefund }
