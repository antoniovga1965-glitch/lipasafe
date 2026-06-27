'use strict'
const prisma     = require('../utils/prisma')
const logger     = require('../utils/logger')
const redis      = require('../utils/redis')
const pw = require('../utils/platformWallet')
const fundiQueue = require('../queues/fundiQueue')

const ADMIN_PHONE = process.env.ADMIN_PHONE

async function resolveOriginator(originatorConversationID) {
  const val = await redis.get(`fundi:b2c:originator:${originatorConversationID}`)
  if (val) return JSON.parse(val)
  return null
}

const fundiB2cResult = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body = req.body?.Result
    if (!body) return
    const { OriginatorConversationID, ResultCode, ResultDesc, TransactionID: mpesaRef } = body
    logger.info('Fundi B2C result', { OriginatorConversationID, ResultCode })

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) { logger.warn('Fundi B2C result: no match', { OriginatorConversationID }); return }

    const { jobId, type } = match
    const job = await prisma.fundiJob.findUnique({ where: { id: jobId }, include: { escrow: true } })
    if (!job) { logger.warn('Fundi B2C result: job not found', { jobId }); return }

    if (ResultCode === 0) {
      if (type === 'payout') {
        const fundiFee = Number(job.serviceFee)
        await prisma.$transaction(async (tx) => {
          await tx.fundiJob.update({ where: { id: jobId }, data: { status: 'PAID', mpesaRef } })
          await tx.fundiEscrow.updateMany({ where: { jobId }, data: { status: 'released', releasedAt: new Date() } })
          if (fundiFee > 0) await pw.credit(tx, fundiFee, jobId)
        })
        await fundiQueue.add('send_raw_sms', { phone: job.fundiPhone, message: `LipaSafe: Umepokea KES ${job.fundiReceives} kwa kazi ${jobId.slice(0,8).toUpperCase()}. Mpesa: ${mpesaRef}` })
        await fundiQueue.add('send_raw_sms', { phone: job.buyerPhone, message: `LipaSafe: Kazi imekamilika. Fundi amelipwa. Ref: ${mpesaRef}` })
        logger.info('Fundi B2C payout confirmed + fee credited', { jobId, mpesaRef, fundiFee })
      } else {
        await prisma.$transaction([
          prisma.fundiJob.update({ where: { id: jobId }, data: { status: 'REFUNDED', mpesaRef } }),
          prisma.fundiEscrow.updateMany({ where: { jobId }, data: { status: 'refunded', refundedAt: new Date() } }),
        ])
        await fundiQueue.add('send_raw_sms', { phone: job.buyerPhone, message: `LipaSafe: Refund ya KES ${job.amount} imetumwa kwako. Mpesa: ${mpesaRef}` })
        logger.info('Fundi B2C refund confirmed', { jobId, mpesaRef })
      }
      await redis.del(`fundi:b2c:${type}:${jobId}`)
    } else {
      const retryKey   = `fundi:b2c:retry:${type}:${jobId}`
      const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
      logger.warn('Fundi B2C failed', { jobId, type, ResultCode, attempt: retryCount + 1 })

      if (retryCount < 3) {
        const delays = [2*60*1000, 5*60*1000, 10*60*1000]
        await redis.set(retryKey, retryCount + 1, 'EX', 86400)
        await redis.del(`fundi:b2c:${type}:lock:${jobId}`)
        if (type === 'payout') {
          await fundiQueue.add('payout_fundi',
            { jobId, fundiPhone: job.fundiPhone, amount: (job.fundiReceives || job.amount).toString() },
            { delay: delays[retryCount] })
        } else {
          await fundiQueue.add('refund_buyer',
            { jobId, buyerId: job.buyerId, amount: job.amount.toString() },
            { delay: delays[retryCount] })
        }
        logger.warn('Fundi B2C retry queued', { jobId, type, attempt: retryCount + 1 })
      } else {
        await redis.del(`fundi:b2c:${type}:${jobId}`)
        await redis.del(`fundi:b2c:retry:${type}:${jobId}`)
        if (ADMIN_PHONE) {
          await fundiQueue.add('send_raw_sms', {
            phone:   ADMIN_PHONE,
            message: `LIPASAFE CRITICAL: Fundi B2C ${type} failed 3x. Job: ${jobId.slice(0,8).toUpperCase()}. Code: ${ResultCode}. Manual action required.`
          })
        }
        logger.error('Fundi B2C failed 3x - admin escalated', { jobId, type, ResultCode })
      }
    }
  } catch (err) {
    logger.error('fundiB2cResult error', { err: err.message, stack: err.stack })
  }
}

const fundiB2cTimeout = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body = req.body?.Result
    const OriginatorConversationID = body?.OriginatorConversationID
    logger.warn('Fundi B2C timeout', { OriginatorConversationID })
    if (!OriginatorConversationID) return
    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) { logger.warn('Fundi B2C timeout: no match', { OriginatorConversationID }); return }
    const { jobId, type } = match
    if (ADMIN_PHONE) {
      await fundiQueue.add('send_raw_sms', {
        phone:   ADMIN_PHONE,
        message: `LIPASAFE WARNING: Fundi B2C ${type} timeout. Job: ${jobId.slice(0,8).toUpperCase()}. Awaiting Safaricom reconciliation.`
      })
    }
    logger.warn('Fundi B2C timeout recorded', { jobId, type })
  } catch (err) {
    logger.error('fundiB2cTimeout error', { err: err.message, stack: err.stack })
  }
}

module.exports = { fundiB2cResult, fundiB2cTimeout }
