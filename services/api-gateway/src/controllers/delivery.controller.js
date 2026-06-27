'use strict'
const prisma = require('../utils/prisma')
const { createAndSend } = require('../services/notificationService')
const logger  = require('../utils/logger')
const {
  createDeliveryOrder,
  uploadBeforePhoto,
  buyerConfirmsBeforePhoto,
  enterPickupOTP,
  uploadDuringPhoto,
  verifyReceiptOTP,
  uploadAfterPhoto,
  markReceived,
  extendDeliveryTime,
  openDispute,
  submitRating,
  getHighRiskStatus,
  getDeliveryHistory,
} = require('../services/deliveryService')

// ─── CREATE ORDER ─────────────────────────────────
const createOrder = async (req, res) => {
  try {
    const { deliveryGuyPhone, amount, goods, productDescription, address, deliveryTime } = req.body
    const buyerId = req.user.userId

    if (!deliveryGuyPhone || !amount || !goods || !address || !deliveryTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' })
    }
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount.' })
    }
    const dt = new Date(deliveryTime)
    if (Number.isNaN(dt.getTime()) || dt <= new Date()) {
      return res.status(400).json({ success: false, message: 'Delivery time must be a valid future date.' })
    }

    const result = await createDeliveryOrder({ buyerId, deliveryGuyPhone, amount, goods, productDescription, address, deliveryTime })
    return res.status(201).json(result)
  } catch (e) {
    console.error(e)
    logger.error('createOrder error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPLOAD BEFORE PHOTO ─────────────────────────
const beforePhoto = async (req, res) => {
  try {
    const { orderId, deliveryGuyPhone } = req.body
    const userId = req.user.userId
    if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded.' })
    if (!orderId || !deliveryGuyPhone)  return res.status(400).json({ success: false, message: 'Missing orderId or deliveryGuyPhone.' })

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: orderId },
      select: { buyerId: true, deliveryGuyPhone: true }
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

    const sanitizedPhone = deliveryGuyPhone.startsWith('0')
      ? '254' + deliveryGuyPhone.slice(1)
      : deliveryGuyPhone

    if (order.buyerId !== userId && order.deliveryGuyPhone !== sanitizedPhone) {
      return res.status(403).json({ success: false, message: 'Not your order' })
    }

    const result = await uploadBeforePhoto({
      orderId,
      deliveryGuyPhone,
      cloudinaryUrl:       req.file.path,
      cloudinaryPublicId:  req.file.filename,
    })
    return res.json(result)
  } catch (e) {
    console.error('[beforePhoto] REAL ERROR:', {
      message: e.message,
      stack:   e.stack,
      body:    req.body,
      file:    req.file?.originalname,
    })
    logger.error('beforePhoto error', { err: e.message, stack: e.stack, body: req.body })
    return res.status(500).json({ success: false, message: e.message || 'Internal server error.' })
  }
}

// ─── BUYER CONFIRMS BEFORE PHOTO ─────────────────
const confirmBeforePhoto = async (req, res) => {
  try {
    const { orderId, confirmed } = req.body
    const buyerId = req.user.userId
    if (!orderId || confirmed === undefined) {
      return res.status(400).json({ success: false, message: 'Missing orderId or confirmed.' })
    }
    const result = await buyerConfirmsBeforePhoto({ orderId, buyerId, confirmed })
    return res.json(result)
  } catch (e) {
    logger.error('confirmBeforePhoto error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── ENTER PICKUP OTP ─────────────────────────────
const pickupOTP = async (req, res) => {
  try {
    const { orderId, deliveryGuyPhone, otp } = req.body
    const userId = req.user.userId
    if (!orderId || !deliveryGuyPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' })
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ success: false, message: 'OTP must be exactly 6 digits.' })
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: orderId },
      select: { buyerId: true, deliveryGuyPhone: true }
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

    const sanitizedPhone = deliveryGuyPhone.startsWith('0')
      ? '254' + deliveryGuyPhone.slice(1)
      : deliveryGuyPhone

    if (order.buyerId !== userId && order.deliveryGuyPhone !== sanitizedPhone) {
      return res.status(403).json({ success: false, message: 'Not your order' })
    }

    const result = await enterPickupOTP({ orderId, deliveryGuyPhone, otp: String(otp) })
    return res.json(result)
  } catch (e) {
    logger.error('pickupOTP error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPLOAD DURING PHOTO ─────────────────────────
// ─── UPLOAD DURING PHOTO ─────────────────────────
const duringPhoto = async (req, res) => {
  try {
    const { orderId, deliveryGuyPhone } = req.body
    const userId = req.user.userId  // ← Get user ID
    
    if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded.' })
    if (!orderId || !deliveryGuyPhone) return res.status(400).json({ success: false, message: 'Missing orderId or deliveryGuyPhone.' })
const order = await prisma.deliveryOrder.findUnique({
  where: { id: orderId },
  select: { buyerId: true, deliveryGuyPhone: true }
})

if (!order) return res.status(404).json({ success: false, message: 'Order not found' })


const sanitizedPhone = deliveryGuyPhone.startsWith('0')
  ? '254' + deliveryGuyPhone.slice(1)
  : deliveryGuyPhone

if (order.buyerId !== userId && order.deliveryGuyPhone !== sanitizedPhone) {
  return res.status(403).json({ success: false, message: 'Not your order' })
}

    const result = await uploadDuringPhoto({
      orderId,
      deliveryGuyPhone,
      cloudinaryUrl:      req.file.path,
      cloudinaryPublicId: req.file.filename,
    })
    return res.json(result)
  } catch (e) {
    console.error(e)
    logger.error('duringPhoto error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}
// ─── VERIFY RECEIPT OTP ──────────────────────────
const receiptOTP = async (req, res) => {
  try {
    const { orderId, otp } = req.body
    const buyerId = req.user.userId
    if (!orderId || !otp) {
      return res.status(400).json({ success: false, message: 'Missing orderId or otp.' })
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ success: false, message: 'OTP must be exactly 6 digits.' })
    }
    const result = await verifyReceiptOTP({ orderId, buyerId, otp: String(otp) })
    return res.json(result)
  } catch (e) {
    console.error(e)
    logger.error('receiptOTP error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── UPLOAD AFTER PHOTO ──────────────────────────
const afterPhoto = async (req, res) => {
  try {
    const { orderId } = req.body
    const buyerId = req.user.userId
    if (!req.file) return res.status(400).json({ success: false, message: 'No photo uploaded.' })
    if (!orderId)  return res.status(400).json({ success: false, message: 'Missing orderId.' })

    const result = await uploadAfterPhoto({
      orderId,
      buyerId,
      cloudinaryUrl:      req.file.path,
      cloudinaryPublicId: req.file.filename,
    })
    return res.json(result)
  } catch (e) {
    console.error(e)
    logger.error('afterPhoto error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── MARK RECEIVED ────────────────────────────────
const received = async (req, res) => {
  try {
    const { orderId } = req.body
    const buyerId = req.user.userId
    if (!orderId) return res.status(400).json({ success: false, message: 'Missing orderId.' })

    const result = await markReceived({ orderId, buyerId })
    return res.json(result)
  } catch (e) {
    console.error(e)
    if (e.message === 'AFTER_PHOTO_REQUIRED') {
      return res.status(400).json({ success: false, message: 'After photo required for high-risk delivery guy.', code: 'AFTER_PHOTO_REQUIRED' })
    }
    logger.error('received error', { err: e.message, stack: e.stack, code: e.code })
    console.error('MARK_RECEIVED_ERROR:', e)
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── EXTEND DELIVERY TIME ─────────────────────────
const extendTime = async (req, res) => {
  try {
    const { orderId, extensionMinutes } = req.body
    const buyerId = req.user.userId
    const minutes = parseInt(extensionMinutes)
    if (!orderId) return res.status(400).json({ success: false, message: 'Missing orderId.' })
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      return res.status(400).json({ success: false, message: 'Extension must be between 1 and 1440 minutes.' })
    }
    const result = await extendDeliveryTime({ orderId, buyerId, extensionMinutes: minutes })
    return res.json(result)
  } catch (e) {
    logger.error('extendTime error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── OPEN DISPUTE ─────────────────────────────────
const dispute = async (req, res) => {
  try {
    const { orderId, claimerType, reason } = req.body
    const claimerId = req.user.id
    if (!orderId || !claimerType || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' })
    }
    const result = await openDispute({ orderId, claimerType, reason, claimerId })
    return res.json(result)
  } catch (e) {
    console.error(e)
    logger.error('dispute error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── SUBMIT RATING ────────────────────────────────
const rate = async (req, res) => {
  try {
    const { orderId, rating, review } = req.body
    const buyerId = req.user.userId
    if (!orderId || !rating) {
      return res.status(400).json({ success: false, message: 'Missing orderId or rating.' })
    }
    const parsedRating = Number(rating)
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' })
    }
    const result = await submitRating({ orderId, buyerId, rating: parsedRating, review })
    return res.json(result)
  } catch (e) {
    logger.error('rate error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── HIGH RISK STATUS ─────────────────────────────
const highRiskStatus = async (req, res) => {
  try {
    const { phone } = req.query
    if (!phone) return res.status(400).json({ success: false, message: 'Missing phone.' })
    const result = await getHighRiskStatus(phone)
    return res.json({ success: true, ...result })
  } catch (e) {
    logger.error('highRiskStatus error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ─── DELIVERY HISTORY ─────────────────────────────
const history = async (req, res) => {
  try {
    const { type = 'buyer', limit = 20, offset = 0 } = req.query
    if (!req.user) { console.log('ERROR: req.user is undefined'); return res.status(401).json({ success: false, message: 'req.user missing' }) }
    const userId = req.user.id
    const phone  = req.user.phone
    if (process.env.NODE_ENV !== 'production') console.log('HISTORY_DEBUG:', { userId, phone, type })
    const result = await getDeliveryHistory({ userId, phone, type, limit, offset })
    return res.json(result)
  } catch (e) {
  
    console.error('HISTORY_ERROR:', e.stack || e.message)
    logger.error('history error', { err: e.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}


const deleteDeliveryOrder = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.userId;
    const order    = await prisma.deliveryOrder.findUnique({ where: { id }, select: { buyerId: true, status: true } });
    if (!order)                    return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.buyerId !== userId)  return res.status(403).json({ success: false, message: 'Not authorized' });
    const moneyHeld = ['PENDING_PHOTO_UPLOAD','PHOTO_WAITING_BUYER_CONFIRMATION','PHOTO_CONFIRMED_BY_BUYER',
      'PICKUP_ISSUED','IN_TRANSIT','DELIVERY_PHOTO_UPLOADED','AWAITING_RECEIPT',
      'RECEIPT_OTP_ISSUED','AWAITING_RELEASE_WINDOW','DISPUTED']
    if (moneyHeld.includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete — delivery is in progress or disputed' })
    }
    await prisma.deliveryOrder.update({ where: { id }, data: { deletedAt: new Date() } });
    return res.json({ success: true, message: 'Order deleted' });
  } catch (err) {
    logger.error('deleteDeliveryOrder error', { err: err.message });
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

module.exports = {
  createOrder,
  beforePhoto,
  confirmBeforePhoto,
  pickupOTP,
  duringPhoto,
  receiptOTP,
  afterPhoto,
  received,
  extendTime,
  dispute,
  rate,
  highRiskStatus,
  history,
  deleteDeliveryOrder,
}
