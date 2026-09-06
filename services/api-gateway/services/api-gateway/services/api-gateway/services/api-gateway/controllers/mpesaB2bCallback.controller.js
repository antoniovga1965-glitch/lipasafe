'use strict'
const prisma        = require('../src/utils/prisma')
const logger        = require('../src/utils/logger')
const redis         = require('../src/utils/redis')
const smsQueue      = require('../src/queues/smsQueue')
const b2bRetryQueue = require('../src/queues/b2cRetryQueue')
const pw            = require('../src/utils/platformWallet')
const { createAndSend: b2bNotify } = require('../src/services/notificationService')
const { fromDecimal } = require('../src/utils/helpers')

const b2bResult = async (req, res) => {
  try {
    const body = req.body?.Result
    if (!body) return res.status(400).json({ message: 'Invalid payload' })

    const { OriginatorConversationID, ConversationID, ResultCode, ResultDesc, TransactionID: mpesaRef } = body
    logger.info('B2B result received', { 
      OriginatorConversationID, 
      ResultCode, 
      ResultDesc, 
      fullBody: JSON.stringify(req.body) 
    })

    let transactionId = null
    let allKeys = null

    // 1. Primary: lookup by transaction.b2bOriginatorId
    const txRecord = await prisma.transaction.findFirst({
      where: { b2bOriginatorId: OriginatorConversationID },
      select: { id: true }
    })
    if (txRecord) {
      transactionId = txRecord.id
      logger.info('B2B lookup: found via transaction.b2bOriginatorId', { transactionId })
    }

    // 2. Fallback: payout table by originatorConversationId
    if (!transactionId) {
      const payoutRecord = await prisma.payout.findFirst({
        where: { originatorConversationId: OriginatorConversationID },
        select: { transactionId: true }
      })
      if (payoutRecord) {
        transactionId = payoutRecord.transactionId
        logger.info('B2B lookup: found via payout.originatorConversationId', { transactionId })
      }
    }

    // 3. Fallback: Redis reverse lookup
    if (!transactionId) {
      transactionId = await redis.get(`b2b:reverse:${OriginatorConversationID}`)
      if (transactionId) {
        logger.info('B2B lookup: found via redis reverse', { transactionId })
      }
    }

    // 3.5. Fallback: Redis reverse lookup by ConversationID
    if (!transactionId && ConversationID) {
      transactionId = await redis.get(`b2b:reverse:${ConversationID}`)
      if (transactionId) {
        logger.info('B2B lookup: found via redis reverse (ConversationID)', { transactionId })
      }
    }

    // 4. Fallback: scan forward keys (lazy — only if all prior lookups missed)
    if (!transactionId) {
      allKeys = await redis.keys('b2b:*')
      for (const key of allKeys) {
        if (key.startsWith('b2b:reverse:') || key.startsWith('b2b:retry:')) continue
        const val = await redis.get(key)
        if (val === OriginatorConversationID) {
          transactionId = key.replace('b2b:', '')
          logger.info('B2B lookup: found via redis forward scan', { transactionId, key })
          break
        }
      }
    }

    if (!transactionId) {
      logger.error('B2B result: CRITICAL — no matching transaction found', { 
        OriginatorConversationID, 
        ResultCode, 
        ResultDesc,
        redisKeys: allKeys 
      })
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        buyer:  { select: { id: true, phone: true } },
        seller: { select: { id: true, phone: true } }
      }
    })
    if (!transaction) {
      logger.error('B2B result: transaction found in lookup but not in DB', { transactionId, OriginatorConversationID })
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── SUCCESS ──
    if (ResultCode === 0) {
      // ── IDEMPOTENCY GUARD: Safaricom retries callbacks on non-200/timeout ──
      if (transaction.state === 'released') {
        logger.info('B2B result: duplicate callback, already released — skipping side effects', { transactionId, mpesaRef })
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }
      await prisma.$transaction(async (db) => {
        await db.transaction.update({
          where: { id: transactionId },
          data: { state: 'released', completedAt: new Date(), mpesaReceipt: mpesaRef }
        })
        await pw.credit(db, fromDecimal(transaction.platformFee).toNumber(), transactionId)
        await db.auditLog.create({
          data: {
            actorType: 'system',
            action: 'b2b_payout_confirmed',
            entityType: 'Transaction',
            entityId: transactionId,
            newState: { state: 'released', mpesaRef, ResultDesc },
            transactionId
          }
        })
      })

      // Reputation bump (outside transaction, fire-and-forget)
      await Promise.allSettled([
        prisma.user.update({ 
          where: { id: transaction.buyerId }, 
          data: { 
            reputationScore: { increment: 0.5 }, 
            totalTransactions: { increment: 1 }, 
            totalCompleted: { increment: 1 } 
          } 
        }),
        prisma.user.update({ 
          where: { id: transaction.sellerId }, 
          data: { 
            reputationScore: { increment: 0.5 }, 
            totalTransactions: { increment: 1 }, 
            totalCompleted: { increment: 1 } 
          } 
        })
      ])

      const notifyPhone = transaction.notifyPhone || transaction.seller.phone
      const isTill = transaction.sellerTill != null
      if (transaction.category === 'second_hand') {
        // Push notifications — Safaricom confirmed, safe to tell users
        await b2bNotify({ userId: transaction.sellerId, type: 'money_released', transactionId,
          messageEn: `KES ${transaction.sellerReceives} released to your account. Ref: ${transaction.referenceNo}` }).catch(() => {})
        await b2bNotify({ userId: transaction.buyerId, type: 'money_released', transactionId,
          messageEn: `Transaction complete. Funds sent to seller. Ref: ${transaction.referenceNo}` }).catch(() => {})
        await smsQueue.add('second_hand_released_seller', {
          type:          'second_hand_released_seller',
          phone:         notifyPhone,
          amount:        transaction.sellerReceives.toString(),
          transactionId,
        })
        await smsQueue.add('second_hand_released_buyer', {
          type:          'second_hand_released_buyer',
          phone:         transaction.buyer.phone,
          transactionId,
        })
      } else {
        await smsQueue.add('bundle_released_seller', {
          type: isTill ? 'bundle_released_seller_till' : 'bundle_released_seller',
          phone: notifyPhone,
          amount: transaction.sellerReceives.toString(),
          sellerTill: transaction.sellerTill || null,
          referenceNo: transaction.referenceNo
        })
        await smsQueue.add('bundle_released_buyer', {
          type: 'bundle_released_buyer',
          phone: transaction.buyer.phone,
          referenceNo: transaction.referenceNo
        })
      }

      await prisma.payout.updateMany({
        where: { transactionId },
        data: { 
          status: 'confirmed', 
          mpesaRef, 
          resultCode: 0, 
          resultDesc: ResultDesc, 
          completedAt: new Date() 
        }
      })
      
      await redis.del(`b2b:${transactionId}`)
      await redis.del(`b2b:reverse:${OriginatorConversationID}`)
      if (ConversationID) await redis.del(`b2b:reverse:${ConversationID}`)
      await redis.del(`b2b:retry:${transactionId}`)
      
      logger.info('B2B payout confirmed', { transactionId, mpesaRef })

    // ── FAILURE ──
    } else {
      // ── IDEMPOTENCY GUARD: duplicate failure callbacks must not double-refund ──
      const currentTx = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { state: true }
      })
      if (currentTx?.state === 'confirmed') {
        logger.warn('B2B failure: duplicate callback, already refunded — skipping', { transactionId, ResultCode })
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }

      const retryKey = `b2b:retry:${transactionId}`
      const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
      const nextAttempt = retryCount + 1

      await prisma.$transaction(async (db) => {
        // Refund escrow back to buyer
        await db.wallet.update({
          where: { userId: transaction.buyerId },
          data: {
            escrowBalance: { increment: transaction.amount },
            totalOut: { decrement: transaction.amount },
            lastUpdated: new Date()
          }
        })
        
        // Reset transaction to confirmed (funds back in escrow)
        await db.transaction.update({
          where: { id: transactionId },
          data: { state: 'confirmed', payoutInitiatedAt: null }
        })
        
        await db.auditLog.create({
          data: {
            actorType: 'system', 
            action: 'b2b_payout_failed',
            entityType: 'Transaction', 
            entityId: transactionId,
            newState: { state: 'confirmed', ResultCode, ResultDesc, retryAttempt: nextAttempt },
            transactionId
          }
        })
        
        await db.payout.updateMany({
          where: { transactionId },
          data: { 
            status: 'failed', 
            resultCode: isNaN(parseInt(ResultCode)) ? null : parseInt(ResultCode), 
            resultDesc: ResultDesc, 
            failedAt: new Date() 
          }
        })
      })

      if (nextAttempt <= 3) {
        const delays = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
        const delayMs = delays[retryCount]
        
        await redis.set(retryKey, nextAttempt, 'EX', 86400)
        
        await b2bRetryQueue.add('retry_release', { transactionId }, { delay: delayMs })
        
        logger.warn('B2B payout failed — retry queued', {
          transactionId, 
          attempt: nextAttempt, 
          delayMs, 
          ResultCode,
          ResultDesc
        })
      } else {
        // Exhausted retries — escalate to admin
        await redis.del(retryKey)
        await redis.del(`b2b:${transactionId}`)
        await redis.del(`b2b:reverse:${OriginatorConversationID}`)
        
        await prisma.auditLog.create({
          data: {
            actorType: 'system', 
            action: 'b2b_payout_escalated',
            entityType: 'Transaction', 
            entityId: transactionId,
            newState: { note: 'B2B failed 3x — admin manual release required', ResultCode, ResultDesc },
            transactionId
          }
        })
        
        const ADMIN_PHONE = process.env.ADMIN_PHONE
        if (ADMIN_PHONE) {
          await smsQueue.add('sms_reply', {
            type: 'raw', 
            phone: ADMIN_PHONE,
            message: `LIPASAFE CRITICAL: B2B till payout failed 3x for ${transaction.referenceNo}. KES ${transaction.sellerReceives}. Till: ${transaction.sellerTill}. Manual release required NOW.`
          })
        }
        
        logger.error('B2B payout failed 3x — admin escalated', { 
          transactionId, 
          ResultCode, 
          ResultDesc,
          attempts: nextAttempt 
        })
      }
    }

    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    logger.error('b2bResult callback error', { err: err.message, stack: err.stack })
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}

const b2bTimeout = async (req, res) => {
  try {
    const body = req.body?.Result
    const OriginatorConversationID = body?.OriginatorConversationID
    const ConversationID = body?.ConversationID
    logger.warn('B2B timeout received', { OriginatorConversationID, ConversationID })

    if (OriginatorConversationID) {
      const { handlePayoutNotConfirmed, findTransactionIdForOriginator } = require('./payoutTransitions')
      const transactionId = await findTransactionIdForOriginator(OriginatorConversationID, ConversationID)

      if (transactionId) {
        await handlePayoutNotConfirmed(transactionId, {
          reason: 'timeout',
          resultCode: null,
          resultDesc: 'Callback timeout — no response from Safaricom'
        })
      } else {
        logger.error('b2bTimeout: no matching transaction found for OriginatorConversationID', {
          OriginatorConversationID
        })
      }
    }

    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    logger.error('b2bTimeout callback error', { err: err.message })
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}


 
module.exports = { b2bResult, b2bTimeout }