'use strict'
const prisma   = require('../src/utils/prisma')
const logger   = require('../src/utils/logger')
const redis    = require('../src/utils/redis')
const smsQueue = require('../src/queues/smsQueue')

const ADMIN_PHONE = process.env.ADMIN_PHONE
const pw       = require('../src/utils/platformWallet')
const { calcFeesDelivery } = require('../src/utils/feeCalculator')

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  let normalized
  if (p.startsWith('+254')) normalized = p.slice(1)
  else if (p.startsWith('0'))    normalized = '254' + p.slice(1)
  else if (p.startsWith('254'))  normalized = p
  else throw new Error(`Invalid phone number: ${phone}`)
  if (!/^254\d{9}$/.test(normalized)) throw new Error(`Invalid phone number: ${phone}`)
  return normalized
}

async function resolveOriginator(originatorConversationID) {
  const raw = await redis.get(`delivery:b2c:originator:${originatorConversationID}`)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

const deliveryB2cResult = async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body = req.body?.Result
    if (!body) return

    const { OriginatorConversationID, ResultCode, ResultDesc, TransactionID: mpesaRef } = body
    logger.info('Delivery B2C result', { OriginatorConversationID, ResultCode })

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) {
      logger.warn('Delivery B2C result: no match', { OriginatorConversationID })
      return
    }

    const { orderId, type } = match
    const order = await prisma.deliveryOrder.findUnique({
      where:   { id: orderId },
      include: { escrow: true },
    })
    if (!order) {
      logger.warn('Delivery B2C result: order not found', { orderId })
      return
    }

    // save raw callback for audit trail
    await prisma.deliveryMpesaCallback.create({
      data: { orderId, type, payload: body },
    }).catch(err => logger.error('Failed to save callback audit', { err: err.message }))

    if (ResultCode === 0) {
      if (type === 'payout') {
        const fees = calcFeesDelivery(order.amount)
        let payoutCount = 0
        await prisma.$transaction(async (tx) => {
          const [payoutUpdate] = await Promise.all([
            tx.deliveryOrder.updateMany({
              where: { id: orderId, status: { not: 'COMPLETED' } },
              data:  { status: 'COMPLETED', mpesaRef },
            }),
            tx.deliveryEscrow.updateMany({
              where: { orderId },
              data:  { status: 'released', releasedAt: new Date() },
            }),
          ])
          payoutCount = payoutUpdate.count
          if (payoutCount > 0 && fees.platformFee.gt(0)) {
            await pw.credit(tx, Number(fees.platformFee), `delivery-fee-${orderId}`)
          }
        })
        if (payoutCount === 0) {
          logger.warn('Delivery B2C payout callback duplicate — already COMPLETED', { orderId })
          return
        }
        const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
        await smsQueue.add('send-sms', {
          to:      normalizePhone(order.deliveryGuyPhone),
          message: `LipaSafe: Umepokea KES ${order.amount} kwa delivery ${orderId.slice(0,8).toUpperCase()}. Mpesa: ${mpesaRef}`,
        })
        await smsQueue.add('send-sms', {
          to:      normalizePhone(buyer.phone),
          message: `LipaSafe: Delivery complete. Delivery guy has been paid. Ref: ${mpesaRef}`,
        })
        logger.info('Delivery B2C payout confirmed + fee credited', { orderId, mpesaRef })

      } else {
        // refund
        const [refundUpdate] = await prisma.$transaction([
          prisma.deliveryOrder.updateMany({
            where: { id: orderId, status: { not: 'REFUNDED' } },
            data:  { status: 'REFUNDED', mpesaRef },
          }),
          prisma.deliveryEscrow.updateMany({
            where: { orderId },
            data:  { status: 'refunded', refundedAt: new Date() },
          }),
        ])
        if (refundUpdate.count === 0) {
          logger.warn('Delivery B2C refund callback duplicate — already REFUNDED', { orderId })
          return
        }
        const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
        await smsQueue.add('send-sms', {
          to:      normalizePhone(buyer.phone),
          message: `LipaSafe: Refund ya KES ${order.amount} imetumwa kwako. Mpesa: ${mpesaRef}`,
        })
        logger.info('Delivery B2C refund confirmed', { orderId, mpesaRef })
      }

      await redis.del(`delivery:b2c:${type}:${orderId}`)
      await redis.del(`delivery:b2c:retry:${type}:${orderId}`)
      await redis.del(`delivery:b2c:originator:${OriginatorConversationID}`)

    } else {
      // B2C failed — retry logic
      const retryKey   = `delivery:b2c:retry:${type}:${orderId}`
      const retryCount = parseInt(await redis.get(retryKey) || '0', 10)
      console.error('DELIVERY B2C FAILED — full details:', { orderId, type, ResultCode, ResultDesc, attempt: retryCount + 1 })
      logger.warn('Delivery B2C failed', { orderId, type, ResultCode, attempt: retryCount + 1 })

      if (retryCount < 3) {
        const delays = [2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
        await redis.set(retryKey, retryCount + 1, 'EX', 86400)
        await redis.del(`delivery:b2c:${type}:lock:${orderId}`)
        const retryPhone = type === 'refund'
          ? (await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })).phone
          : order.deliveryGuyPhone
        await require('../src/queues/b2cRetryQueue').add(
          `delivery-${type}`,
          { orderId, type: `delivery-${type}`, phone: retryPhone, amount: order.amount },
          { delay: delays[retryCount] }
        )
        logger.warn('Delivery B2C retry queued', { orderId, type, attempt: retryCount + 1 })
      } else {
        await redis.del(`delivery:b2c:${type}:${orderId}`)
        await redis.del(`delivery:b2c:retry:${type}:${orderId}`)
        if (ADMIN_PHONE) {
          await smsQueue.add('send-sms', {
            to:      normalizePhone(ADMIN_PHONE),
            message: `LIPASAFE CRITICAL: Delivery B2C ${type} failed 3x. Order: ${orderId.slice(0,8).toUpperCase()}. Code: ${ResultCode}. Manual action required.`,
          })
        }
        logger.error('Delivery B2C failed 3x — admin escalated', { orderId, type, ResultCode })
      }
    }
  } catch (err) {
    logger.error('deliveryB2cResult error', { err: err.message, stack: err.stack })
  }
}

const deliveryB2cTimeout = async (req, res) => {
   res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  try {
    const body = req.body?.Result
    const OriginatorConversationID = body?.OriginatorConversationID
    logger.warn('Delivery B2C timeout', { OriginatorConversationID })
    if (!OriginatorConversationID) return

    const match = await resolveOriginator(OriginatorConversationID)
    if (!match) {
      logger.warn('Delivery B2C timeout: no match', { OriginatorConversationID })
      return
    }
    const { orderId, type } = match
    if (ADMIN_PHONE) {
      await smsQueue.add('send-sms', {
        to:      normalizePhone(ADMIN_PHONE),
        message: `LIPASAFE WARNING: Delivery B2C ${type} timeout. Order: ${orderId.slice(0,8).toUpperCase()}. Awaiting Safaricom reconciliation.`,
      })
    }
    logger.warn('Delivery B2C timeout recorded', { orderId, type })
  } catch (err) {
    logger.error('deliveryB2cTimeout error', { err: err.message, stack: err.stack })
  }
}

module.exports = { deliveryB2cResult, deliveryB2cTimeout }
