'use strict'
const prisma  = require('../src/utils/prisma')
const logger  = require('../src/utils/logger')
const smsQueue = require('../src/queues/smsQueue')
const redis  = require('../src/utils/redis')
const crypto = require('crypto')
const b2cRetryQueue          = require('../src/queues/b2cRetryQueue')
const Decimal                = require('decimal.js')
const { getPlatformWalletId } = require('./wallet.controller')
const { createAndSend }    = require('../src/services/notificationService')
const { stkSendRefund }     = require('../src/services/stkSendRefundService')

// ── ResultURL — Safaricom calls this when B2C completes or fails ──
const b2cResult = async (req, res) => {
  let transactionId = null
  let lockKey = null
  let lockVal = null

  try {
    const body = req.body?.Result
    if (!body) return res.status(400).json({ message: 'Invalid payload' })

    const { OriginatorConversationID, ResultCode, ResultDesc, TransactionID: mpesaRef } = body

    if (!OriginatorConversationID) {
      logger.warn('B2C result: missing OriginatorConversationID')
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    logger.info('B2C result received', { OriginatorConversationID, ResultCode, ResultDesc })

    // Step 1: Lookup transaction by OriginatorConversationID (O(1))
    transactionId = await redis.get(`originator:${OriginatorConversationID}`)

    if (!transactionId) {
      logger.warn('B2C result: no matching transaction', { OriginatorConversationID })
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── WALLET SEND fast-path (WalletTransaction, not escrow Transaction) ──
    if (transactionId.startsWith('wallet_send:')) {
      const reference = transactionId.replace('wallet_send:', '')
      const resultCode = Number(ResultCode)

      const walletTx = await prisma.walletTransaction.findUnique({
        where:  { reference },
        select: { id: true, status: true, amount: true, fee: true, fromWallet: { select: { userId: true } }, toWallet: { select: { userId: true } } },
      })

      if (!walletTx) {
        logger.warn('B2C wallet_send: WalletTransaction not found', { reference })
        await redis.del(`originator:${OriginatorConversationID}`)
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }

      if (!['pending'].includes(walletTx.status)) {
        logger.warn('B2C wallet_send: already settled', { reference, status: walletTx.status })
        await redis.del(`originator:${OriginatorConversationID}`)
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }

      if (resultCode === 0) {
        // SUCCESS — mark completed
        await prisma.walletTransaction.update({
          where: { reference },
          data:  { status: 'completed', note: `Instant send — M-Pesa ref ${mpesaRef}` },
        })
        logger.info('B2C wallet_send success', { reference, mpesaRef })

        // Notify receiver — money has arrived
        try {
          if (walletTx.toWallet?.userId) {
            await createAndSend({
              userId:        walletTx.toWallet.userId,
              type:          'money_received',
              transactionId: null,
              messageEn:     `You have received KES ${new Decimal(walletTx.amount).toFixed(2)} via LipaSafe Instant Send. Ref: ${reference}`,
            })
          }
        } catch (notifErr) {
          logger.error('Receiver notification failed', { reference, err: notifErr.message })
        }
      } else {
        // FAILURE — revert sender balance + claw back platform fee
        logger.warn('B2C wallet_send failed — reverting', { reference, ResultCode, ResultDesc })

        if (!walletTx.fromWallet) {
          // STK-funded send — no wallet was ever debited, so there's nothing to "revert" there.
          // Refund the sender directly via M-Pesa using context persisted before the B2C call fired.
          try {
            await stkSendRefund(reference, { mpesaRef, resultCode: ResultCode, resultDesc: ResultDesc })
          } catch (refundErr) {
            logger.error('stkSendRefund failed — scheduling retry', { reference, err: refundErr.message })
            const retryKey   = `stk_refund_retry:${reference}`
            const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
            const delays     = [2 * 60 * 1000, 5 * 60 * 1000]
            if (retryCount < delays.length) {
              await redis.set(retryKey, retryCount + 1, 'EX', 86400)
              await b2cRetryQueue.add('stk_send_refund', { type: 'stk_send_refund', reference }, { delay: delays[retryCount] })
              logger.warn('stkSendRefund — retry scheduled', { reference, attempt: retryCount + 1, delayMs: delays[retryCount] })
            } else {
              logger.error('CRITICAL: stkSendRefund permanently failed after retries — manual refund required', { reference, senderErr: refundErr.message })
              await prisma.auditLog.create({
                data: {
                  actorId:    null,
                  actorType:  'system',
                  action:     'stk_send_refund_permanent_failure',
                  entityType: 'WalletTransaction',
                  entityId:   reference,
                  metadata:   { reference, err: refundErr.message },
                },
              }).catch(e => logger.error('Failed to write permanent_failure audit log', { reference, err: e.message }))
            }
          }
        } else {
        try {
          const platformWalletId = await getPlatformWalletId()
          const sendAmount  = new Decimal(walletTx.amount)
          const platformFee = new Decimal(walletTx.fee || 0)
          // totalDeduct = sendAmount + platformFee + b2cCharge
          // We stored only platformFee in fee column; b2cCharge = totalDeduct - sendAmount - platformFee
          // But we don't have totalDeduct here — reconstruct from fee tx
          const feeTx = await prisma.walletTransaction.findUnique({
            where:  { reference: `${reference}-fee` },
            select: { amount: true },
          })
          const totalPlatformCredited = feeTx ? new Decimal(feeTx.amount) : platformFee
          // totalDeduct = sendAmount + totalPlatformCredited (b2cCharge absorbed into platform fee tx)
          const totalDeduct = sendAmount.plus(totalPlatformCredited)

          await prisma.$transaction(async (db) => {
            // Refund sender
            await db.wallet.update({
              where: { userId: walletTx.fromWallet.userId },
              data: {
                availableBalance: { increment: totalDeduct.toFixed(2) },
                totalOut:         { decrement: totalDeduct.toFixed(2) },
                lastUpdated:      new Date(),
              },
            })
            // Claw back platform credit
            await db.wallet.update({
              where: { id: platformWalletId },
              data: {
                availableBalance: { decrement: totalPlatformCredited.toFixed(2) },
                totalIn:          { decrement: totalPlatformCredited.toFixed(2) },
                lastUpdated:      new Date(),
              },
            })
            // Mark both txs as failed
            await db.walletTransaction.updateMany({
              where: { reference: { in: [reference, `${reference}-fee`] } },
              data:  { status: 'failed' },
            })
            await db.auditLog.create({
              data: {
                actorId:    null,
                actorType:  'system',
                action:     'wallet_send_b2c_failed_reverted',
                entityType: 'WalletTransaction',
                entityId:   reference,
                amount:     totalDeduct.toFixed(2),
                metadata:   { ResultCode, ResultDesc, mpesaRef, reference },
              },
            })
          })
          logger.info('B2C wallet_send reverted — sender refunded', { reference, totalDeduct: totalDeduct.toFixed(2) })

          // Notify sender — send failed, wallet refunded
          try {
            await createAndSend({
              userId:        walletTx.fromWallet.userId,
              type:          'money_sent',
              transactionId: null,
              messageEn:     `Your Instant Send of KES ${new Decimal(walletTx.amount).toFixed(2)} failed. KES ${totalDeduct.toFixed(2)} has been refunded to your wallet. Ref: ${reference}`,
            })
          } catch (notifErr) {
            logger.error('Sender failure notification failed', { reference, err: notifErr.message })
          }
        } catch (revertErr) {
          logger.error('CRITICAL: wallet_send B2C revert failed', { reference, err: revertErr.message })
        }
        }
      }

      await redis.del(`originator:${OriginatorConversationID}`)
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── REQUEST MONEY fast-path ──
    if (transactionId.startsWith('request_money:')) {
      const requestId  = transactionId.replace('request_money:', '')
      const resultCode = Number(ResultCode)
      await redis.del(`originator:${OriginatorConversationID}`)
      if (resultCode === 0) {
        await prisma.requestMoney.update({
          where: { id: requestId },
          data:  { b2cRef: mpesaRef, b2cStatus: 'confirmed' }
        }).catch(e => logger.warn('request_money b2c confirm failed', { e: e.message }))
        logger.info('Request money B2C confirmed', { requestId, mpesaRef })
      } else {
        logger.error('CRITICAL: Request money B2C payout failed', { requestId, ResultCode, ResultDesc })
      }
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // ── HOUSE PAYOUT fast-path ──
    if (transactionId.startsWith('house_payout:')) {
      const escrowId   = transactionId.replace('house_payout:', '')
      const resultCode = Number(ResultCode)
      await redis.del(`originator:${OriginatorConversationID}`)
      if (resultCode === 0) {
        await prisma.houseEscrow.update({
          where: { id: escrowId },
          data:  { status: 'COMPLETED', mpesaRef, completedAt: new Date() },
        }).catch(e => logger.warn('house_payout b2c confirm failed', { e: e.message }))
        await prisma.houseAuditLog.create({
          data: { escrowId, action: 'PAYOUT_CONFIRMED', meta: { mpesaRef } },
        }).catch(e => logger.warn('house_payout audit log failed', { e: e.message }))
        // Credit platform fee
        try {
          const escrow = await prisma.houseEscrow.findUnique({
            where:  { id: escrowId },
            select: { platformFee: true },
          })
          if (escrow?.platformFee && Number(escrow.platformFee) > 0) {
            const { credit } = require('../src/utils/platformWallet')
            await credit(prisma, Number(escrow.platformFee), `HOUSE-FEE-${escrowId}`, `Platform fee for house escrow ${escrowId}`)
          }
        } catch (feeErr) {
          logger.warn('house_payout: platform fee credit failed', { escrowId, err: feeErr.message })
        }
        logger.info('House B2C payout confirmed', { escrowId, mpesaRef })
      } else {
        logger.error('CRITICAL: House B2C payout failed', { escrowId, ResultCode, ResultDesc })
      }
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }
    // ── HOUSE REFUND fast-path ──
    if (transactionId.startsWith('house_refund:')) {
      const escrowId  = transactionId.replace('house_refund:', '')
      const resultCode = Number(ResultCode)
      await redis.del(`originator:${OriginatorConversationID}`)
      if (resultCode === 0) {
        await prisma.houseEscrow.update({
          where: { id: escrowId },
          data:  { status: 'REFUNDED', b2cRef: mpesaRef },
        }).catch(e => logger.warn('house_refund b2c confirm failed', { e: e.message }))
        await prisma.houseAuditLog.create({
          data: { escrowId, action: 'REFUND_CONFIRMED', meta: { mpesaRef } },
        }).catch(e => logger.warn('house_refund audit log failed', { e: e.message }))
        logger.info('House B2C refund confirmed', { escrowId, mpesaRef })
      } else {
        logger.error('CRITICAL: House B2C refund failed', { escrowId, ResultCode, ResultDesc })
      }
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }
    // ── STK SEND REFUND fast-path ──
    if (transactionId.startsWith("stk_refund:")) {
      const reference  = transactionId.replace("stk_refund:", "")
      const resultCode = Number(ResultCode)
      await redis.del(`originator:${OriginatorConversationID}`)
      if (resultCode === 0) {
        try {
          const { stkSendRefund } = require("../src/services/stkSendRefundService")
          await stkSendRefund(reference, { mpesaRef, resultCode, resultDesc: ResultDesc })
          logger.info("STK send refund confirmed", { reference, mpesaRef })
        } catch (refundErr) {
          logger.error("CRITICAL: stkSendRefund post-callback failed", { reference, err: refundErr.message })
        }
      } else {
        logger.error("CRITICAL: STK send refund B2C itself failed", { reference, ResultCode, ResultDesc })
      }
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" })
    }
    // ── PROTECTED TRANSFER fast-path ──
    if (transactionId.startsWith('protected_transfer:')) {
      const transferId = transactionId.replace('protected_transfer:', '')
      const resultCode = Number(ResultCode)

      // originator prefix tells us which action fired (set in transfer.controller.js)
      const isAccept  = OriginatorConversationID.startsWith('PT-ACC-')
      const isDecline = OriginatorConversationID.startsWith('PT-DEC-')
      const isCancel  = OriginatorConversationID.startsWith('PT-CAN-')
      const isExpire  = OriginatorConversationID.startsWith('PT-EXP-')

      if (resultCode === 0) {
        // B2C confirmed — advance RELEASING/REFUNDING to final state
        const finalState = isAccept ? 'ACCEPTED' : isDecline ? 'DECLINED' : isExpire ? 'EXPIRED' : 'CANCELLED'

        const transfer = await prisma.protectedTransfer.update({
          where:  { id: transferId },
          data:   { state: finalState, b2cRef: mpesaRef },
          select: { senderId: true, recipientPhone: true, amount: true,
                    platformFee: true,
                    sender: { select: { fullName: true } } }
        })

        if (isAccept) {
          // Credit platform wallet with fee
          try {
            const { credit } = require('../src/utils/platformWallet')
            await credit(
              prisma,
              Number(transfer.platformFee),
              `PT-FEE-${transferId}`,
              `Platform fee for SafeSend ${transferId}`
            )
            logger.info('PT platform fee credited', { transferId, fee: transfer.platformFee })
          } catch (feeErr) {
            logger.error('CRITICAL: PT platform fee credit failed', {
              transferId, fee: transfer.platformFee, err: feeErr.message
            })
          }
          // Final delivery confirmed — notify sender
          createAndSend({
            userId:    transfer.senderId,
            type:      'transfer_accepted',
            messageEn: `Your KES ${transfer.amount} SafeSend was delivered to ${transfer.recipientPhone}. M-Pesa ref: ${mpesaRef}`,
            messageSw: null,
            channel:   'push'
          }).catch(e => logger.warn('PT accept delivery notify failed', { err: e.message }))
        } else {
          // Refund delivered — notify sender
          const action = isDecline ? 'declined' : 'cancelled'
          createAndSend({
            userId:    transfer.senderId,
            type:      `transfer_${action}`,
            messageEn: `Your KES ${transfer.amount} SafeSend refund has landed on your M-Pesa. Ref: ${mpesaRef}`,
            messageSw: null,
            channel:   'push'
          }).catch(e => logger.warn('PT refund delivery notify failed', { err: e.message }))
        }

        logger.info('ProtectedTransfer B2C confirmed', { transferId, mpesaRef, finalState })
      } else {
        // B2C failed — retry up to 2x then escalate
        const retryKey   = `pt:b2c:retry:${transferId}`
        const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
        const delays     = [2 * 60 * 1000, 5 * 60 * 1000]

        if (retryCount < delays.length) {
          await redis.set(retryKey, retryCount + 1, 'EX', 86400)
          await b2cRetryQueue.add(
            'pt_b2c_retry',
            { type: 'pt_b2c_retry', transferId,
              action: isAccept ? 'accept' : isDecline ? 'decline' : 'cancel' },
            { delay: delays[retryCount] }
          )
          logger.warn('ProtectedTransfer B2C failed — retry scheduled',
            { transferId, attempt: retryCount + 1, ResultCode })
        } else {
          // Final failure — notify sender + escalate
          await redis.del(retryKey)
          const transfer = await prisma.protectedTransfer.findUnique({
            where:  { id: transferId },
            select: { senderId: true, amount: true }
          })
          if (transfer) {
            createAndSend({
              userId:    transfer.senderId,
              type:      'transfer_failed',
              messageEn: isAccept
                ? `Your KES ${transfer.amount} SafeSend delivery failed. Please contact support. Ref: ${transferId}`
                : `Your KES ${transfer.amount} SafeSend refund failed. Please contact support. Ref: ${transferId}`,
              messageSw: null,
              channel:   'push'
            }).catch(e => logger.warn('PT B2C final fail notify error', { err: e.message }))
          }
          logger.error('CRITICAL: ProtectedTransfer B2C permanently failed',
            { transferId, ResultCode, ResultDesc })
        }
      }

      await redis.del(`originator:${OriginatorConversationID}`)
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // Step 2: Acquire distributed lock
    lockKey = `lock:b2c:${transactionId}`
    lockVal = crypto.randomUUID()
    const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 60)
    if (!acquired) {
      logger.warn('B2C result: callback already processing', { transactionId })
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // Step 3: Fetch transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { buyer: { select: { phone: true } }, seller: { select: { phone: true } } }
    })

    if (!transaction) {
      logger.warn('B2C result: transaction not found', { transactionId })
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // Step 4: Validate state
    const validStates = ['payout_pending', 'releasing']
    if (!validStates.includes(transaction.state)) {
      logger.warn('B2C result: invalid state', { transactionId, state: transaction.state })
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }


   
    const resultCode = Number(ResultCode)

    if (resultCode === 0) {
      // ──── SUCCESS ────
      await prisma.$transaction(async (db) => {
        const claim = await db.transaction.updateMany({
          where: { id: transactionId, state: { in: ['payout_pending', 'releasing'] } },
          data: { state: 'released', completedAt: new Date(), mpesaReceipt: mpesaRef }
        })
        if (claim.count !== 1) throw new Error('ALREADY_PROCESSED')

        await db.auditLog.create({
          data: {
            actorType: 'system', action: 'b2c_payout_success',
            entityType: 'Transaction', entityId: transactionId,
            newState: { state: 'released', mpesaRef },
            metadata: { OriginatorConversationID, ResultDesc },
            transactionId
          }
        })

        const payoutUpdate = await db.payout.updateMany({
          where: { transactionId },
          data: { status: 'confirmed', mpesaRef, resultCode: 0, resultDesc: ResultDesc, completedAt: new Date() }
        })
        if (payoutUpdate.count !== 1) throw new Error('PAYOUT_UPDATE_FAILED')
      })

      // Clean Redis keys — payout complete
      await redis.del(`originator:${OriginatorConversationID}`)
      await redis.del(`b2c:retry:${transactionId}`)

      await smsQueue.add('b2c_success_seller', { type: 'b2c_payout_success', phone: transaction.seller.phone, amount: transaction.sellerReceives, referenceNo: transaction.referenceNo }).catch(e => logger.warn('SMS failed', { err: e.message }))
      await smsQueue.add('b2c_success_buyer', { type: 'b2c_payout_notified_buyer', phone: transaction.buyer.phone, referenceNo: transaction.referenceNo }).catch(e => logger.warn('SMS failed', { err: e.message }))

      if (transaction.category === 'second_hand') {
        const { createAndSend: b2cNotify } = require('../src/services/notificationService')
        await b2cNotify({ userId: transaction.sellerId, type: 'money_released', transactionId,
          messageEn: `KES ${transaction.sellerReceives} released to your account. Ref: ${transaction.referenceNo}` }).catch(() => {})
        await b2cNotify({ userId: transaction.buyerId, type: 'money_released', transactionId,
          messageEn: `Transaction complete. Funds sent to seller. Ref: ${transaction.referenceNo}` }).catch(() => {})
      }
      logger.info('B2C payout confirmed', { transactionId, mpesaRef })

    } else {
      // ──── FAILURE ────
      const retryKey = `b2c:retry:${transactionId}`
      const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
      const isFinalAttempt = retryCount >= 2

      const existingPayout = await prisma.payout.findFirst({ where: { transactionId } })
      if (!existingPayout) throw new Error('PAYOUT_RECORD_MISSING')
      if (existingPayout.status === 'confirmed') {
        logger.info('B2C failure: payout already confirmed, ignoring', { transactionId })
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }
      if (existingPayout.status === 'permanent_failure') {
        logger.info('B2C failure: already escalated, ignoring', { transactionId })
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }
      if (existingPayout.status === 'recovered') {
        logger.warn('B2C failure: payout already closed by recovery sweep, ignoring late callback', { transactionId })
        return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      }

      const nextPayoutStatus = isFinalAttempt ? 'permanent_failure' : 'retrying'

      await prisma.$transaction(async (db) => {
        await db.transaction.update({ where: { id: transactionId }, data: { state: 'payout_pending' } })
        await db.auditLog.create({
          data: {
            actorType: 'system', action: 'b2c_payout_failed',
            entityType: 'Transaction', entityId: transactionId,
            newState: { state: 'payout_pending', payoutStatus: nextPayoutStatus, resultCode, resultDesc: ResultDesc, retryAttempt: retryCount + 1, isFinal: isFinalAttempt },
            metadata: { OriginatorConversationID },
            transactionId
          }
        })
        await db.payout.updateMany({ where: { transactionId }, data: { status: nextPayoutStatus, resultCode, resultDesc: ResultDesc, failedAt: new Date() } })
      })

      if (!isFinalAttempt) {
        const delayMs = [2 * 60 * 1000, 5 * 60 * 1000][retryCount]
        await redis.set(retryKey, retryCount + 1, 'EX', 86400)
        await b2cRetryQueue.add('b2c_retry', { transactionId, category: transaction.category }, { delay: delayMs })
        logger.warn('B2C failed — retry scheduled', { transactionId, attempt: retryCount + 1, delayMs, resultCode })
      } else {
        await redis.del(retryKey)
        await redis.del(`originator:${OriginatorConversationID}`)
        const ADMIN_PHONE = process.env.ADMIN_PHONE
        if (ADMIN_PHONE) {
          await smsQueue.add('admin_alert', { type: 'raw', phone: ADMIN_PHONE, message: `🚨 B2C FAILED 3x: Ref ${transaction.referenceNo}, KES ${transaction.sellerReceives}, TX ${transactionId}` }).catch(e => logger.error('Admin SMS failed', { err: e.message }))
        }
        logger.error('B2C permanently failed — admin escalated', { transactionId, resultCode, referenceNo: transaction.referenceNo })
      }
    }

    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })

  } catch (err) {
    if (err.message === 'ALREADY_PROCESSED') {
      logger.info('B2C callback: idempotent skip', { transactionId })
    } else {
      logger.error('b2cResult exception', { transactionId, err: err.message, stack: err.stack })
    }
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })

  } finally {
    // Release lock with ownership check
    if (lockKey && lockVal) {
      try {
        const current = await redis.get(lockKey)
        if (current === lockVal) {
          await redis.del(lockKey)
        }
      } catch (e) {
        logger.warn('Lock cleanup failed', { transactionId, err: e.message })
      }
    }

  }
}


// ── TimeoutURL ──
const b2cTimeout = async (req, res) => {
  try {
    const body = req.body?.Result
    const OriginatorConversationID = body?.OriginatorConversationID

    logger.warn('B2C timeout received', { OriginatorConversationID })

    if (OriginatorConversationID) {
      const transactionId = await redis.get(`originator:${OriginatorConversationID}`)
      if (transactionId) {
        await prisma.auditLog.create({
          data: {
            actorType: 'system', action: 'b2c_timeout',
            entityType: 'Transaction', entityId: transactionId,
            newState: { state: 'payout_pending', note: 'B2C timeout — awaiting reconciliation' },
            transactionId
          }
        })
      }
    }

    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } catch (err) {
    logger.error('b2cTimeout exception', { err: err.message })
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}

module.exports = { b2cResult, b2cTimeout }
