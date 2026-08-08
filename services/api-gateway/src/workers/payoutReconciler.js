'use strict'
const prisma  = require('../utils/prisma')
const { getToken } = require('../utils/mpesaToken');
const logger  = require('../utils/logger')
const axios   = require('axios')
const { releaseFunds } = require('../services/bundleService')
const { releaseToSeller } = require('../services/secondHandService')

const STUCK_THRESHOLD_MS = 10 * 60 * 1000
const ADMIN_PHONE        = process.env.ADMIN_PHONE
const isSandbox          = process.env.MPESA_ENV === 'sandbox'
const baseURL            = isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke'

// ── Query Safaricom for B2C transaction status ──
const queryB2cStatus = async (originatorConversationId) => {
  try {
    const token = await getToken()

    const res = await axios.get(
      `${baseURL}/mpesa/transactionstatus/v1/query`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          Initiator:                process.env.MPESA_B2C_INITIATOR_NAME,
          SecurityCredential:       process.env.MPESA_B2C_SECURITY_CREDENTIAL,
          CommandID:                'TransactionStatusQuery',
          TransactionID:            originatorConversationId,
          PartyA:                   process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE,
          IdentifierType:           '4',
          ResultURL:                process.env.MPESA_B2C_RESULT_URL,
          QueueTimeOutURL:          process.env.MPESA_B2C_TIMEOUT_URL,
          Remarks:                  'Reconciliation status check',
          Occasion:                 'Reconciliation'
        },
        timeout: 15000
      }
    )
    return res.data
  } catch (err) {
    logger.warn('queryB2cStatus: Safaricom query failed', { err: err.message })
    return null
  }
}

// ── Query Safaricom for B2B transaction status ──
const queryB2bStatus = async (originatorConversationId) => {
  try {
    const token = await getToken()

    const res = await axios.get(
      `${baseURL}/mpesa/transactionstatus/v1/query`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          Initiator:                process.env.MPESA_B2B_INITIATOR_NAME,
          SecurityCredential:       process.env.MPESA_B2B_SECURITY_CREDENTIAL,
          CommandID:                'TransactionStatusQuery',
          TransactionID:            originatorConversationId,
          PartyA:                   process.env.MPESA_B2B_SHORTCODE,
          IdentifierType:           '4',
          ResultURL:                process.env.MPESA_B2B_RESULT_URL,
          QueueTimeOutURL:          process.env.MPESA_B2B_TIMEOUT_URL,
          Remarks:                  'Reconciliation status check',
          Occasion:                 'Reconciliation'
        },
        timeout: 15000
      }
    )
    return res.data
  } catch (err) {
    logger.warn('queryB2bStatus: Safaricom query failed', { err: err.message })
    return null
  }
}

const reconcileStuckPayouts = async () => {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS)

  let stuck
  try {
    stuck = await prisma.transaction.findMany({
      where: {
        OR: [
          { state: 'payout_pending', payoutInitiatedAt: { lte: cutoff } },
          { state: 'releasing',      payoutInitiatedAt: { lte: cutoff } },
          { state: 'releasing',      payoutInitiatedAt: null, completedAt: { lte: cutoff } }
        ]
      },
      select: {
        id: true,
        referenceNo: true,
        amount: true,
        buyerId: true,
        category: true,
        sellerReceives: true,
        sellerTill: true,
        payoutInitiatedAt: true,
        completedAt: true
      },
      take: 20
    })
  } catch (err) {
    console.error(err)
    logger.error('payoutReconciler: DB query failed', { err: err.message })
    return
  }

  if (stuck.length === 0) return
  logger.warn(`payoutReconciler: found ${stuck.length} stuck payout_pending transaction(s)`, {
    ids: stuck.map(t => t.referenceNo)
  })

  for (const tx of stuck) {
    try {
      const payout = await prisma.payout.findFirst({ where: { transactionId: tx.id, payoutType: 'full' } })

      // ── Case 1: Payout confirmed in our DB but tx state not updated ──
      if (payout?.status === 'confirmed') {
        logger.warn('payoutReconciler: payout confirmed but tx stuck — fixing state', {
          transactionId: tx.id, referenceNo: tx.referenceNo
        })
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { state: 'released', completedAt: new Date() }
        })
        await prisma.auditLog.create({
          data: {
            actorType: 'system', action: 'reconciler_state_fix',
            entityType: 'Transaction', entityId: tx.id,
            newState: { state: 'released', note: 'Reconciler fixed missed callback state update' },
            transactionId: tx.id
          }
        })
        continue
      }

      // ── Case 2: Already failed + retries exhausted — escalate ──
      if (payout?.status === 'failed') {
        const redis = require('../utils/redis')
        const retryKey = tx.sellerTill ? `b2b:retry:${tx.id}` : `b2c:retry:${tx.id}`
        const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
        if (retryCount >= 3) {
          const alreadyEscalated = await prisma.auditLog.findFirst({
            where: { transactionId: tx.id, action: { in: ['b2c_payout_escalated', 'b2b_payout_escalated', 'reconciler_escalated'] } }
          })
          if (!alreadyEscalated) {
            const smsQueue = require('../queues/smsQueue')
            if (ADMIN_PHONE) {
              await smsQueue.add('sms_reply', {
                type: 'raw', phone: ADMIN_PHONE,
                message: `LIPASAFE CRITICAL: Stuck payout for ${tx.referenceNo}. KES ${tx.sellerReceives}. Manual release required NOW.`
              })
            }
            await prisma.auditLog.create({
              data: {
                actorType: 'system', action: 'reconciler_escalated',
                entityType: 'Transaction', entityId: tx.id,
                newState: { note: 'Reconciler escalated after 3 failed retries' },
                transactionId: tx.id
              }
            })
            logger.error('payoutReconciler: escalated to admin', { transactionId: tx.id, referenceNo: tx.referenceNo })
          }
          continue
        }
      }

      // ── Case 3: sent/pending, or failed-at-initiation with retries left — revert + retry ──
      if (!payout || ['pending', 'sent', 'failed'].includes(payout.status)) {
        const stuckMins = Math.round((Date.now() - tx.payoutInitiatedAt) / 60000)
        logger.warn('payoutReconciler: no callback received — querying Safaricom', {
          transactionId: tx.id, referenceNo: tx.referenceNo, stuckMins
        })

        // Ask Safaricom if they actually paid
        let safaricomConfirmed = false
        if (payout?.originatorConversationId && !payout.originatorConversationId.startsWith('init_')) {
          const statusRes = tx.sellerTill
            ? await queryB2bStatus(payout.originatorConversationId)
            : await queryB2cStatus(payout.originatorConversationId)
          if (statusRes?.ResultCode === '0') {
            safaricomConfirmed = true
            logger.warn('payoutReconciler: Safaricom confirms payout went through — marking released', {
              transactionId: tx.id
            })
            await prisma.$transaction(async (db) => {
              await db.transaction.update({
                where: { id: tx.id },
                data: { state: 'released', completedAt: new Date() }
              })
              await db.payout.update({
                where: { transactionId_payoutType: { transactionId: tx.id, payoutType: 'full' } },
                data: { status: 'confirmed', completedAt: new Date(), resultDesc: 'Confirmed via reconciler query' }
              })
              await db.auditLog.create({
                data: {
                  actorType: 'system', action: 'reconciler_confirmed_via_query',
                  entityType: 'Transaction', entityId: tx.id,
                  newState: { state: 'released', note: 'Safaricom status query confirmed payment' },
                  transactionId: tx.id
                }
              })
            })
            continue
          }
        }

        // Safaricom says not paid (or query failed) — safe to revert and retry
        if (!safaricomConfirmed) {
          // releasing + open dispute = admin must resolve, not reconciler
          if (tx.state === 'releasing') {
            const openDispute = await prisma.dispute.findFirst({
              where:  { transactionId: tx.id, status: 'open' },
              select: { id: true },
            })
            if (openDispute) {
              logger.warn('payoutReconciler: releasing tx has open dispute — skipping, admin must resolve', {
                transactionId: tx.id, disputeId: openDispute.id
              })
              continue
            }
          }
          await prisma.$transaction(async (db) => {
            const revertState = tx.state === 'releasing' ? 'held' : 'confirmed'
            await db.transaction.update({
              where: { id: tx.id },
              data: { state: revertState, payoutInitiatedAt: null }
            })
            await db.wallet.update({
              where: { userId: tx.buyerId },
              data: {
                escrowBalance: { increment: tx.amount },
                totalOut:      { decrement: tx.amount },
                lastUpdated:   new Date()
              }
            })
            if (payout) {
              await db.payout.update({
                where: { transactionId_payoutType: { transactionId: tx.id, payoutType: 'full' } },
                data: { status: 'failed', failedAt: new Date(), resultDesc: 'Reconciler timeout — no callback, reverted for retry' }
              })
            }
            await db.auditLog.create({
              data: {
                actorType: 'system', action: 'reconciler_revert',
                entityType: 'Transaction', entityId: tx.id,
                newState: { state: 'confirmed', note: 'Reconciler reverted stuck payout_pending for retry' },
                transactionId: tx.id
              }
            })
          })
          const revertLabel = tx.state === 'releasing' ? 'held' : 'confirmed'
          logger.warn(`payoutReconciler: reverted to ${revertLabel} — triggering retry`, { transactionId: tx.id, category: tx.category })
          if (tx.category === 'second_hand') {
            await releaseToSeller(tx.id, 'reconciler_retry')
          } else {
            await releaseFunds(tx.id)
          }
        }
      }

    } catch (err) {
      console.error(err)
      logger.error('payoutReconciler: failed to process stuck tx', {
        transactionId: tx.id, err: err.message
      })
    }
  }
}

const reconcileEscrowBalances = async () => {
  try {
    const drifted = await prisma.$queryRaw`
      SELECT w."userId", w."escrowBalance",
        COALESCE(SUM(t.amount), 0) AS actual_escrow
      FROM "Wallet" w
      LEFT JOIN "Transaction" t
        ON t."buyerId" = w."userId"
        AND t.state IN ('held', 'confirmed')
      GROUP BY w."userId", w."escrowBalance"
      HAVING w."escrowBalance" != COALESCE(SUM(t.amount), 0)
    `
    for (const row of drifted) {
      logger.warn('Escrow drift detected — correcting', {
        userId: row.userId,
        recorded: row.escrowBalance,
        actual: row.actual_escrow,
        drift: Number(row.escrowBalance) - Number(row.actual_escrow)
      })
      await prisma.wallet.update({
        where: { userId: row.userId },
        data: { escrowBalance: row.actual_escrow }
      })
    }
    if (drifted.length === 0) {
      logger.info('Escrow reconciliation — no drift found')
    }
  } catch (err) {
    logger.error('reconcileEscrowBalances failed', { err: err.message })
  }
}

// Boot + schedule
const { reconcileStuckFundiPayouts } = require('./fundiPayoutReconciler')

const runReconciliation = async () => {
  await reconcileStuckPayouts()
  await reconcileStuckFundiPayouts()
  await reconcileEscrowBalances()
}

runReconciliation()
const interval = setInterval(runReconciliation, 5 * 60 * 1000)
process.on('SIGTERM', () => clearInterval(interval))
process.on('SIGINT',  () => clearInterval(interval))

logger.info('Payout reconciler started — sweeping every 5 minutes')
module.exports = { reconcileStuckPayouts, reconcileEscrowBalances, queryB2cStatus }
