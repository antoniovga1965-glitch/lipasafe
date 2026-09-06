'use strict'
const prisma = require('../src/utils/prisma')
const logger = require('../src/utils/logger')

/**
 * Single source of truth for "payout did not confirm" — covers both
 * explicit Safaricom failure (ResultCode !== 0) and timeout (no callback
 * received in time). Both callers converge here so refund + retry/escalate
 * logic can't drift apart again.
 */
const handlePayoutNotConfirmed = async (transactionId, { reason, resultCode, resultDesc }) => {
  const redis = require('../src/utils/redis')

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } })
  if (!transaction) {
    logger.error('handlePayoutNotConfirmed: transaction not found', { transactionId, reason })
    return
  }

  // Already resolved — don't double-refund
  if (transaction.state !== 'payout_pending' && transaction.state !== 'releasing') {
    logger.info('handlePayoutNotConfirmed: transaction already in terminal/refunded state, skipping', {
      transactionId, currentState: transaction.state, reason
    })
    return
  }
  if (transaction.state === 'released') {
    logger.warn('handlePayoutNotConfirmed: called on already-released transaction — ignoring', { transactionId, reason })
    return
  }

  const retryKey = `b2b:retry:${transactionId}`
  const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
  const nextAttempt = retryCount + 1

  await prisma.$transaction(async (db) => {
    await db.wallet.update({
      where: { userId: transaction.buyerId },
      data: {
        escrowBalance: { increment: transaction.amount },
        totalOut: { decrement: transaction.amount },
        lastUpdated: new Date()
      }
    })

    await db.transaction.update({
      where: { id: transactionId },
      data: { state: 'confirmed', payoutInitiatedAt: null }
    })

    await db.auditLog.create({
      data: {
        actorType: 'system',
        action: reason === 'timeout' ? 'b2b_payout_timeout' : 'b2b_payout_failed',
        entityType: 'Transaction',
        entityId: transactionId,
        newState: { state: 'confirmed', reason, resultCode, resultDesc, retryAttempt: nextAttempt },
        transactionId
      }
    })

    await db.payout.updateMany({
      where: { transactionId },
      data: {
        status: reason === 'timeout' ? 'timed_out' : 'failed',
        resultCode: resultCode != null && !isNaN(parseInt(resultCode)) ? parseInt(resultCode) : null,
        resultDesc: resultDesc || (reason === 'timeout' ? 'Callback timeout — no response from Safaricom' : null),
        failedAt: new Date()
      }
    })
  })

  if (nextAttempt <= 3) {
    const delays = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
    const delayMs = delays[retryCount]

    await redis.set(retryKey, nextAttempt, 'EX', 86400)

    const b2cRetryQueue = require('../src/queues/b2cRetryQueue')
    await b2cRetryQueue.add('retry_release', { transactionId }, { delay: delayMs })

    logger.warn('Payout not confirmed — retry queued', {
      transactionId, attempt: nextAttempt, delayMs, reason, resultCode, resultDesc
    })
  } else {
    await redis.del(retryKey)
    await redis.del(`b2b:${transactionId}`)

    await prisma.auditLog.create({
      data: {
        actorType: 'system',
        action: 'b2b_payout_escalated',
        entityType: 'Transaction',
        entityId: transactionId,
        newState: { note: 'Payout failed/timed out 3x — admin manual release required', reason, resultCode, resultDesc },
        transactionId
      }
    })

    const ADMIN_PHONE = process.env.ADMIN_PHONE
    if (ADMIN_PHONE) {
      const smsQueue = require('../src/queues/smsQueue')
      await smsQueue.add('sms_reply', {
        type: 'raw',
        phone: ADMIN_PHONE,
        message: `LIPASAFE CRITICAL: B2B payout failed 3x for ${transaction.referenceNo}. KES ${transaction.sellerReceives}. Till: ${transaction.sellerTill}. Reason: ${reason}. Manual release required NOW.`
      })
    }

    logger.error('Payout not confirmed — escalated after 3 attempts', {
      transactionId, reason, resultCode, resultDesc, attempts: nextAttempt
    })
  }
}

module.exports = { handlePayoutNotConfirmed }

const findTransactionIdForOriginator = async (OriginatorConversationID, ConversationID) => {
  const redis = require('../src/utils/redis')

  const txRecord = await prisma.transaction.findFirst({
    where: { b2bOriginatorId: OriginatorConversationID },
    select: { id: true }
  })
  if (txRecord) return txRecord.id

  const payoutRecord = await prisma.payout.findFirst({
    where: { originatorConversationId: OriginatorConversationID },
    select: { transactionId: true }
  })
  if (payoutRecord) return payoutRecord.transactionId

  const reverseHit = await redis.get(`b2b:reverse:${OriginatorConversationID}`)
  if (reverseHit) return reverseHit
  if (ConversationID) {
    const reverseHit2 = await redis.get(`b2b:reverse:${ConversationID}`)
    if (reverseHit2) return reverseHit2
  }

  const allKeys = await redis.keys('b2b:*')
  for (const key of allKeys) {
    if (key.startsWith('b2b:reverse:') || key.startsWith('b2b:retry:')) continue
    const val = await redis.get(key)
    if (val === OriginatorConversationID || (ConversationID && val === ConversationID)) return key.replace('b2b:', '')
  }

  return null
}

module.exports = { ...module.exports, findTransactionIdForOriginator }
