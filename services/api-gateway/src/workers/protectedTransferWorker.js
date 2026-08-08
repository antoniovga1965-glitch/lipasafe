'use strict'
const { Worker, Queue } = require('bullmq')
const prisma            = require('../utils/prisma')
const logger            = require('../utils/logger')
const { initiateB2C }   = require('../utils/mpesaB2C')
const { createAndSend } = require('../services/notificationService')
const redis             = require('../utils/redis')
const Decimal           = require('decimal.js')

const transferQueue = new Queue('protectedTransfer', { connection: redis })

const worker = new Worker(
  'protectedTransfer',
  async (job) => {
    if (job.name === 'expire-transfer') {
      const { transferId } = job.data

      const transfer = await prisma.protectedTransfer.findUnique({
        where:   { id: transferId },
        include: { sender: { select: { phone: true, fullName: true } } }
      })

      if (!transfer) {
        logger.warn('Expiry job — transfer not found', { transferId })
        return
      }

      if (transfer.state !== 'PENDING') {
        logger.info('Expiry job — transfer already settled', { transferId, state: transfer.state })
        return
      }

      const refundAmount = new Decimal(transfer.amount)
        .toDecimalPlaces(0)
        .toNumber() 

      const originatorId = `PT-EXP-${transferId.slice(0, 16)}`

      await initiateB2C({
        phone:         transfer.sender.phone,
        amount:        refundAmount,
        originatorId,
        transactionId: transferId,
        remarks:       `SafeSend expired refund ${transferId.slice(0, 8)}`
      })

      await prisma.protectedTransfer.update({
        where: { id: transferId },
        data:  { state: 'EXPIRED', expiredAt: new Date() }
      })

      // Notify sender
      createAndSend({
        userId:   transfer.senderId,
        type:     'transfer_expired',
        title:    'SafeSend Expired',
        body:     `Your KES ${transfer.amount} SafeSend to ${transfer.recipientPhone} expired. Full refund on the way to your M-pesa.`,
        channels: ['PUSH', 'SMS'],
        phone:    transfer.sender.phone
      }).catch(e => logger.warn('Expiry sender notify failed', { err: e.message }))

      // Notify recipient if registered
      if (transfer.recipientId) {
        createAndSend({
          userId:   transfer.recipientId,
          type:     'transfer_expired',
          title:    'SafeSend Expired',
          body:     `A KES ${transfer.amount} SafeSend from ${transfer.sender.fullName} expired unclaimed.`,
          channels: ['PUSH'],
          phone:    transfer.recipientPhone
        }).catch(e => logger.warn('Expiry recipient notify failed', { err: e.message }))
      }

      logger.info('Transfer expired + refunded', { transferId, refundAmount })
    }
  },
  {
    connection: redis,
    attempts:   3,
    backoff:    { type: 'exponential', delay: 5000 }
  }
)

worker.on('completed', (job) => logger.info('Transfer job completed', { jobId: job.id }))
worker.on('failed',    (job, err) => logger.error('Transfer job failed', { jobId: job.id, err: err.message }))

process.on('SIGTERM', async () => {
  await worker.close()
  logger.info('protectedTransferWorker shut down cleanly')
})

module.exports = worker
