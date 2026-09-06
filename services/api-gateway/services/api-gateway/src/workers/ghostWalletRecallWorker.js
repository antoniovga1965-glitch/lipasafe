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
    
    const expiredGhostWallets = await prisma.wallet.findMany({
      where: {
        isGhost: true,
        claimedAt: null,
        recallAt: { lt: now },
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
          await prisma.user.delete({ where: { id: wallet.user.id } })
          recalledCount++
          logger.info('Ghost deleted (no funds)', { phone: wallet.user.phone })
          continue
        }

        for (const tx of incomingTxs) {
          await prisma.$transaction([
            prisma.wallet.update({
              where: { userId: tx.fromWallet.userId },
              data: {
                availableBalance: { increment: new Decimal(tx.amount).toFixed(2) },
              },
            }),
            prisma.walletTransaction.create({
              data: {
                fromWalletId: wallet.id,
                toWalletId: tx.fromWallet.id,
                amount: tx.amount,
                type: 'ghost_recall',
                status: 'completed',
                reference: `RECALL-${wallet.id}-${tx.id}`,
                note: 'Ghost wallet expired — refunding unclaimed funds',
              },
            }),
          ])
        }

        await prisma.user.delete({ where: { id: wallet.user.id } })
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
