'use strict'
const { Worker } = require('bullmq')
const logger = require('../utils/logger')
const prisma = require('../utils/prisma')
const {
  handleDeliveryReminder,
  handlePaymentExpiry,
  handleAutoRelease,
  handleDisputeDeadline,
  handleSellerDeliveryDeadline,
  handleInspectionDeadline,
  handleHandoverTimeout,
  refundBuyer
} = require('../services/bundleService')
const secondHandService = require('../services/secondHandService')
const { handleDisputeAdminTimeout } = secondHandService

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

// ─── Unlock listing when escrow falls through ────
const unlockListingForTransaction = async (transactionId) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: { category: true, listingId: true }
    })
    if (tx?.category === 'second_hand' && tx?.listingId) {
      await prisma.secondHandListing.update({
        where: { id: tx.listingId },
        data:  { status: 'active', lockedAt: null }
      })
      logger.info('Listing unlocked after escrow fallthrough', { transactionId, listingId: tx.listingId })
    }
  } catch (err) {
    logger.error('unlockListingForTransaction failed', { transactionId, err: err.message })
  }
}

const worker = new Worker('bundle-timers', async (job) => {
  const { transactionId, jobType } = job.data
  logger.info('Timer job fired', { jobType, transactionId })

  switch (jobType) {
    case 'delivery_reminder':
      await handleDeliveryReminder(transactionId)
      break

    case 'payment_expiry':
      await handlePaymentExpiry(transactionId)
      await unlockListingForTransaction(transactionId) 
      break

    case 'auto_release':
      await secondHandService.handleAutoRelease(transactionId)
      break

    case 'inspection_deadline':
      // Seller window just opened — SMS seller
      await secondHandService.handleInspectionDeadline(transactionId)
      break

    case 'auto_otp':
      await secondHandService.handleAutoOtp(transactionId)
      break
    case 'handover_timeout':
      // Seller missed 30min window — refund buyer
      await secondHandService.handleHandoverTimeout(transactionId)
      break

    case 'otp_entry_timeout':
      // Buyer never entered OTP — auto-release to seller
      await secondHandService.handleOtpEntryTimeout(transactionId)
      break

    case 'buyer_decision_deadline':
      // Buyer 30min decision window expired — auto-release to seller
      await secondHandService.handleBuyerDecisionDeadline(transactionId)
      break

    case 'dispute_seller_timeout':
      await secondHandService.handleDisputeSellerTimeout(transactionId)
      break
    case 'dispute_admin_timeout':
      // Admin never resolved escalated dispute within 24h — auto-refund buyer
      await handleDisputeAdminTimeout(transactionId)
      break
    case 'dispute_deadline':
      await handleDisputeDeadline(transactionId)
      break

    case 'seller_delivery_deadline':
      await handleSellerDeliveryDeadline(transactionId)
      break

    default:
      logger.warn('Unknown timer job type', { jobType })
  }
}, { connection, concurrency: 5 })

worker.on('completed', (job) => logger.info('Timer job done',    { jobId: job.id, type: job.data.jobType }))
worker.on('failed',    (job, err) => logger.error('Timer job failed', { jobId: job.id, type: job.data.jobType, err: err.message }))
worker.on('error',     (err) => logger.error('Timer worker error', { err: err.message }))

logger.info('Timer worker started')
module.exports = worker