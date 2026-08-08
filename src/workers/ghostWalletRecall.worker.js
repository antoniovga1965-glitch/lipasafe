'use strict'
const { Worker } = require('bullmq')
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const Decimal = require('decimal.js')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

const ghostWalletRecallWorker = new Worker('ghost-wallet-recall', async (job) => {
  logger.info('Ghost wallet recall job started')
  
  try {
    const now = new Date()
    
    // Find expired ghost wallets
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000)

    const expiredGhostWallets = await prisma.wallet.findMany({
      where: {
        isGhost: true,
        claimedAt: null,
        recallAt: { lt: now },
        OR: [
          { recallStartedAt: null },
          { recallStartedAt: { lt: staleThreshold } },
        ],
      },
      include: {
        user: { select: { id: true, phone: true } },
      },
    })

    if (expiredGhostWallets.length === 0) {
      logger.info('No expired ghost wallets to recall')
      return { recalled: 0 }
    }

    logger.info(`Found ${expiredGhostWallets.length} expired ghost wallets`)

    let recalledCount = 0

    for (const wallet of expiredGhostWallets) {
      try {
        // Atomic lock — prevent double processing by concurrent workers
        const locked = await prisma.wallet.updateMany({
          where: { id: wallet.id, claimedAt: null, isGhost: true, recallStartedAt: null },
          data: { recallStartedAt: new Date() },
        })
        if (locked.count === 0) {
          logger.warn('Ghost wallet already being recalled — skipping', { walletId: wallet.id })
          continue
        }

        // Get all incoming transactions
        const incomingTxs = await prisma.walletTransaction.findMany({
          where: {
            toWalletId: wallet.id,
            type: 'send',
            status: 'completed',
          },
          include: {
            fromWallet: { select: { userId: true } },
          },
        })

        if (incomingTxs.length === 0) {
          // No money — soft delete ghost
          await prisma.user.update({
            where: { id: wallet.user.id },
            data: { status: 'recalled', isActive: false },
          })
          await prisma.wallet.update({
            where: { id: wallet.id },
            data: { recallCompletedAt: new Date() },
          })
          recalledCount++
          logger.info('Ghost recalled (no funds)', { phone: wallet.user.phone })
          continue
        }

        // Refund each sender
        for (const tx of incomingTxs) {
          // Idempotency — skip if already refunded
          const existingRefund = await prisma.walletTransaction.findUnique({
            where: { reference: `RECALL-${wallet.id}-${tx.id}` },
          })
          if (existingRefund) {
            logger.warn('Refund already processed — skipping', { reference: `RECALL-${wallet.id}-${tx.id}` })
            continue
          }

          await prisma.$transaction([
            // Debit ghost wallet
            prisma.wallet.update({
              where: { id: wallet.id },
              data: {
                availableBalance: { decrement: new Decimal(tx.amount) },
              },
            }),
            // Credit sender
            prisma.wallet.update({
              where: { userId: tx.fromWallet.userId },
              data: {
                availableBalance: { increment: new Decimal(tx.amount) },
              },
            }),
            // Record refund transaction
            prisma.walletTransaction.create({
              data: {
                fromWalletId: wallet.id,
                toWalletId: tx.fromWallet.id,
                amount: tx.amount,
                type: 'ghost_recall',
                status: 'completed',
                reference: `RECALL-${wallet.id}-${tx.id}`,
                note: `Ghost wallet expired — refunding unclaimed funds`,
              },
            }),
          ])
        }

        // Soft delete ghost user — preserve audit trail
        await prisma.user.update({
          where: { id: wallet.user.id },
          data: { status: 'recalled', isActive: false },
        })
        // Mark wallet recall complete for audit
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { recallCompletedAt: new Date() },
        })
        recalledCount++

        logger.info('Ghost wallet recalled', {
          phone: wallet.user.phone,
          refundedSenders: incomingTxs.length,
        })

      } catch (walletErr) {
        logger.error('Ghost wallet recall failed', {
          walletId: wallet.id,
          error: walletErr.message,
        })
      }
    }

    logger.info('Ghost wallet recall complete', { recalled: recalledCount })
    return { recalled: recalledCount }

  } catch (err) {
    logger.error('Ghost wallet recall worker error', { error: err.message })
    throw err
  }
}, { connection })

ghostWalletRecallWorker.on('completed', (job) => {
  logger.info('Ghost wallet recall job completed', { result: job.returnvalue })
})

ghostWalletRecallWorker.on('failed', (job, err) => {
  logger.error('Ghost wallet recall job failed', { jobId: job.id, error: err.message })
})

module.exports = ghostWalletRecallWorker
