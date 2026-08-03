'use strict'
const { Worker }          = require('bullmq')
const Decimal             = require('decimal.js')
const { releaseFunds, b2cPayout } = require('../services/bundleService')
const { deliveryB2cPayout } = require('../services/deliveryService')
const { releaseToSeller, b2cPayout: secondHandB2cPayout } = require('../services/secondHandService')
const { stkSendRefund } = require('../services/stkSendRefundService')
const { initiateB2C }   = require('../utils/mpesaB2C')
const redis             = require('../utils/redis')
const logger              = require('../utils/logger')
const prisma              = require('../utils/prisma')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

const b2cRetryWorker = new Worker('b2c-retry', async (job) => {
  const { transactionId, type, orderId, phone, amount, reference } = job.data
  logger.info('B2C retry — re-attempting payout', { transactionId, type, orderId })

  // Guard — skip if delivery order already settled
  if (orderId) {
    const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId }, select: { status: true } })
    if (order && ['COMPLETED', 'REFUNDED', 'AUTO_REFUNDED'].includes(order.status)) {
      logger.info('B2C retry skipped — order already settled', { orderId })
      return
    }
  }

  if (type === 'second_hand') {
    // Transaction is already 'released' in DB by this point — only the
    // M-Pesa cash transfer failed. Retry the payout only, never re-run
    // the release (releaseToSeller would reject since state is no longer
    // a valid starting state, and could mask the real failure).
    await secondHandB2cPayout(transactionId)

  } else if (type === 'delivery-payout') {
    const _o = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
    await deliveryB2cPayout(orderId, phone || _o.deliveryGuyPhone, new Decimal(amount || _o.amount).toNumber())

  } else if (type === 'delivery-refund') {
    const order  = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
    const buyer  = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
    await deliveryB2cPayout(orderId, buyer.phone, new Decimal(amount || order.amount).toNumber(), 'refund')

  } else if (type === 'stk_send_refund') {
    await stkSendRefund(reference)

  } else if (type === 'pt_b2c_retry') {
    const { transferId, action } = job.data

    // Guard — skip if callback already settled this (race window)
    const transfer = await prisma.protectedTransfer.findUnique({
      where:  { id: transferId },
      select: { state: true, recipientPhone: true, amount: true,
                sender: { select: { phone: true } } }
    })
    if (!transfer) {
      logger.warn('PT B2C retry — transfer not found', { transferId })
      return
    }
    if (['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(transfer.state)) {
      logger.info('PT B2C retry skipped — already settled', { transferId, state: transfer.state })
      return
    }

    const prefix       = action === 'accept' ? 'PT-ACC' : action === 'decline' ? 'PT-DEC' : 'PT-CAN'
    const retryCount   = parseInt(await redis.get(`pt:b2c:retry:${transferId}`) || '0', 10)
    const originatorId = `${prefix}-R${retryCount}-${transferId.slice(0, 10)}`
    const phone        = action === 'accept' ? transfer.recipientPhone : transfer.sender.phone
    const amount       = action === 'accept'
      ? new Decimal(transfer.amount).toNumber()
      : new Decimal(transfer.amount).toDecimalPlaces(0).toNumber()

    await redis.set(`originator:${originatorId}`, `protected_transfer:${transferId}`, 'EX', 86400)
    await initiateB2C({
      phone,
      amount,
      originatorId,
      transactionId: transferId,
      remarks:       `SafeSend retry ${transferId.slice(0, 8)}`
    })
    logger.info('PT B2C retry re-initiated', { transferId, action, originatorId, retryCount })

  } else {
    await releaseFunds(transactionId)
  }

}, { connection, concurrency: 1, lockDuration: 60000, stalledInterval: 30000 })

b2cRetryWorker.on('failed', (job, err) => {
  console.error('B2C retry full error:', err)
  logger.error('B2C retry worker job failed', {
    transactionId: job?.data?.transactionId,
    orderId:        job?.data?.orderId,
    type:           job?.data?.type,
    err:            err.message,
  })
})

module.exports = b2cRetryWorker
