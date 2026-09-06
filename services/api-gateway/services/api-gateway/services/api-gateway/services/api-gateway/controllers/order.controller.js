'use strict'
const { z }    = require('zod')
const Decimal  = require('decimal.js')
const crypto   = require('crypto')
const { calcFeesBuyerSide } = require('../src/utils/feeCalculator')
const prisma   = require('../src/utils/prisma')
const logger   = require('../src/utils/logger')
const smsQueue = require('../src/queues/smsQueue')

const normalizePhone = (p) => {
  const digits = (p || '').replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0')   && digits.length === 10) return '254' + digits.slice(1)
  if (digits.length === 9)                               return '254' + digits
  return null
}

const generateReference = () => {
  // 6-char uppercase alphanumeric, e.g. ABC123
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
}

const getUniqueReference = async () => {
  for (let i = 0; i < 5; i++) {
    const ref = generateReference()
    const exists = await prisma.order.findUnique({ where: { reference: ref } })
    if (!exists) return ref
  }
  throw new Error('Could not generate unique order reference')
}

// ── Create order ────────────────────────────────────────────────────────────
const createOrder = async (req, res) => {
  try {
    const schema = z.object({
      sellerPhone:  z.string().min(9),
      service:      z.string().min(3),
      area:         z.string().min(2),
      amount:       z.number().min(1, 'Minimum amount is KES 20'),
      timerMinutes: z.number().int().min(5).max(10080), // 5 min to 7 days
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { sellerPhone: rawSellerPhone, service, area, amount: rawAmount, timerMinutes } = parsed.data

    const sellerPhone = normalizePhone(rawSellerPhone)
    if (!sellerPhone) {
      return res.status(400).json({ success: false, message: 'Invalid seller phone number' })
    }

    const buyerId = req.user.userId
    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'Buyer not found' })

    const amount = new Decimal(rawAmount).toNearest(1, Decimal.ROUND_HALF_UP)
    const fees   = calcFeesBuyerSide(amount)

    const reference = await getUniqueReference()
    const expiresAt = new Date(Date.now() + timerMinutes * 60 * 1000)

    const order = await prisma.order.create({
      data: {
        reference,
        buyerId,
        sellerPhone,
        service,
        area,
        amount:       amount.toFixed(2),
        buyerTotal:     fees.buyerTotal.toFixed(2),
        timerMinutes,
        state:        'HELD',
        expiresAt,
        platformFee:    fees.platformFee.toFixed(2),
        sellerReceives: fees.sellerReceives.toFixed(2),
      },
    })

    await prisma.orderEvent.create({
      data: {
        orderId:  order.id,
        action:   'CREATED',
        actor:    'buyer',
        metadata: { buyerId, sellerPhone, amount: amount.toFixed(2), platformFee: fees.platformFee.toFixed(2) },
      },
    })

    const linkUrl = `${process.env.PUBLIC_BASE_URL || 'https://lipasafe.co.ke'}/order/${order.reference}`
    await smsQueue.add('order_notify_seller', {
      type:    'raw',
      phone:   sellerPhone,
      message: `LipaSafe: You have a new order (Ref: ${order.reference}) worth KES ${amount.toFixed(0)} for ${service}. View details: ${linkUrl}`,
    })

    logger.info('Order created', { orderId: order.id, reference: order.reference, buyerId })
    return res.status(201).json({ success: true, order })
  } catch (err) {
    logger.error('createOrder failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Get order (buyer app view) ──────────────────────────────────────────────
const getOrder = async (req, res) => {
  try {
    const { ref } = req.params
    const userId  = req.user.userId

    const order = await prisma.order.findUnique({
      where:   { reference: ref },
      include: { dispute: true, events: { orderBy: { timestamp: 'desc' } } },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

    const requestingUser = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    const isBuyer  = order.buyerId === userId
    const isSeller = order.sellerPhone === requestingUser?.phone

    if (!isBuyer && !isSeller) return res.status(403).json({ success: false, message: 'Forbidden' })

    return res.json({ success: true, order })
  } catch (err) {
    logger.error('getOrder failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Release ──────────────────────────────────────────────────────────────────
const releaseOrder = async (req, res) => {
  try {
    const { ref } = req.params
    const buyerId = req.user.userId

    const order = await prisma.order.findUnique({ where: { reference: ref } })
    if (!order)                    return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Forbidden' })

    const updated = await prisma.order.updateMany({
      where: { id: order.id, state: 'HELD' },
      data:  { state: 'RELEASED' },
    })
    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: `Cannot release — order is ${order.state}` })
    }

    await prisma.orderEvent.create({
      data: { orderId: order.id, action: 'RELEASED', actor: 'buyer', metadata: { buyerId } },
    })

    await smsQueue.add('order_notify_seller', {
      type:    'raw',
      phone:   order.sellerPhone,
      message: `LipaSafe: Buyer released payment for order Ref: ${order.reference}. Transaction complete.`,
    })

    logger.info('Order released', { orderId: order.id, reference: order.reference })
    return res.json({ success: true, message: 'Order released' })
  } catch (err) {
    logger.error('releaseOrder failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Dispute ──────────────────────────────────────────────────────────────────
const disputeOrder = async (req, res) => {
  try {
    const { ref } = req.params
    const buyerId = req.user.userId

    const schema = z.object({
      reason:    z.string().min(3),
      buyerNote: z.string().min(10),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }
    const { reason, buyerNote } = parsed.data

    const order = await prisma.order.findUnique({ where: { reference: ref } })
    if (!order)                    return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Forbidden' })

    const updated = await prisma.order.updateMany({
      where: { id: order.id, state: 'HELD' },
      data:  { state: 'DISPUTED' },
    })
    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: `Cannot dispute — order is ${order.state}` })
    }

    await prisma.$transaction([
      prisma.orderDispute.create({
        data: { orderId: order.id, reason, buyerNote },
      }),
      prisma.orderEvent.create({
        data: { orderId: order.id, action: 'DISPUTE_OPENED', actor: 'buyer', metadata: { buyerId, reason } },
      }),
    ])

    const linkUrl = `${process.env.PUBLIC_BASE_URL || 'https://lipasafe.co.ke'}/order/${order.reference}`
    await smsQueue.add('order_notify_seller', {
      type:    'raw',
      phone:   order.sellerPhone,
      message: `LipaSafe: Buyer disputed order Ref: ${order.reference}. Submit your evidence here: ${linkUrl}`,
    })

    if (process.env.ADMIN_PHONE) {
      await smsQueue.add('order_notify_admin', {
        type:    'raw',
        phone:   process.env.ADMIN_PHONE,
        message: `LIPASAFE: Order dispute opened. Ref: ${order.reference}. Reason: ${reason}. Review required.`,
      })
    }

    logger.info('Order dispute opened', { orderId: order.id, reference: order.reference, reason })
    return res.status(201).json({ success: true, message: 'Dispute opened — funds frozen' })
  } catch (err) {
    logger.error('disputeOrder failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


// ── List order disputes (admin) ───────────────────────────────────────────
const listOrderDisputes = async (req, res) => {
  try {
    const disputes = await prisma.orderDispute.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            reference: true, amount: true, sellerPhone: true,
            buyerId: true, state: true,
            buyer: { select: { fullName: true, phone: true } },
          },
        },
      },
    })
    return res.json({ success: true, disputes })
  } catch (err) {
    logger.error('listOrderDisputes failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Resolve order dispute (admin) ─────────────────────────────────────────
const resolveOrderDispute = async (req, res) => {
  try {
    const { disputeId } = req.params
    const { action: rawAction, note } = req.body
    const action = rawAction === 'Refund Buyer'      ? 'REFUND'
                 : rawAction === 'Release to Seller'  ? 'RELEASE'
                 : (rawAction || '').toUpperCase()
    const adminId = req.user.userId

    if (!['REFUND', 'RELEASE'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be REFUND or RELEASE' })
    }

    const dispute = await prisma.orderDispute.findUnique({
      where:   { id: disputeId },
      include: { order: true },
    })
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' })
    if (dispute.resolution) return res.status(400).json({ success: false, message: 'Dispute already resolved' })

    const order = dispute.order
    const Decimal = require('decimal.js')

    // Atomic lock — prevents double-resolve race
    const locked = await prisma.orderDispute.updateMany({
      where: { id: disputeId, resolution: null },
      data:  { resolution: action, resolvedBy: adminId, resolvedAt: new Date() },
    })
    if (locked.count === 0) {
      return res.status(400).json({ success: false, message: 'Dispute already resolved' })
    }

    const houseQueue = require('../src/queues/houseQueue')

    if (action === 'REFUND') {
      const refundAmt = new Decimal(order.platformFee || 0).gt(0)
        ? new Decimal(order.buyerTotal || order.amount).minus(new Decimal(order.platformFee))
        : new Decimal(order.amount)

      await prisma.$transaction([
        prisma.order.update({ where: { id: order.id }, data: { state: 'REFUNDED' } }),
        prisma.orderEvent.create({
          data: { orderId: order.id, action: 'DISPUTE_RESOLVED_REFUND', actor: 'admin', metadata: { adminId, note, refundAmt: refundAmt.toString() } },
        }),
      ])

      try {
        await houseQueue.add('refund_buyer_order', {
          orderId: order.id, buyerId: order.buyerId, amount: refundAmt.toString(),
        }, { jobId: `order-dispute-refund-${disputeId}` })
      } catch (queueErr) {
        logger.error('CRITICAL: order dispute refund queue failed', { disputeId, error: queueErr.message })
        return res.status(500).json({ success: false, message: 'Dispute resolved but refund queue failed — contact engineering' })
      }

      return res.json({ success: true, resolution: 'REFUND', refundAmt: refundAmt.toString() })

    } else {
      const releaseAmt = new Decimal(order.sellerReceives || order.amount)

      await prisma.$transaction([
        prisma.order.update({ where: { id: order.id }, data: { state: 'COMPLETED' } }),
        prisma.orderEvent.create({
          data: { orderId: order.id, action: 'DISPUTE_RESOLVED_RELEASE', actor: 'admin', metadata: { adminId, note, releaseAmt: releaseAmt.toString() } },
        }),
      ])

      try {
        await houseQueue.add('payout_seller_order', {
          orderId: order.id, sellerPhone: order.sellerPhone, sellerReceives: releaseAmt.toString(),
        }, { jobId: `order-dispute-release-${disputeId}` })
      } catch (queueErr) {
        logger.error('CRITICAL: order dispute release queue failed', { disputeId, error: queueErr.message })
        return res.status(500).json({ success: false, message: 'Dispute resolved but payout queue failed — contact engineering' })
      }

      return res.json({ success: true, resolution: 'RELEASE', releaseAmt: releaseAmt.toString() })
    }
  } catch (err) {
    logger.error('resolveOrderDispute failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

module.exports = { createOrder, getOrder, releaseOrder, disputeOrder, listOrderDisputes, resolveOrderDispute }
