'use strict'
const Decimal  = require('decimal.js')
const { getToken } = require('../utils/mpesaToken');
const crypto   = require('crypto')
const prisma   = require('../utils/prisma')
const logger   = require('../utils/logger')
const smsQueue = require('../queues/smsQueue')
const b2cRetryQueue = require('../queues/b2cRetryQueue')
const axios      = require('axios')
const redis      = require('../utils/redis');
const { createAndSend } = require('./notificationService');

// ─── CONSTANTS ────────────────────────────────────
const OTP_EXPIRY_MS       = 10 * 60 * 1000   
const HIGH_RISK_THRESHOLD = 5

// ─── HELPERS ─────────────────────────────────────
const generateOTP = () => String(crypto.randomInt(100000, 999999))

const logTimeline = async (db, orderId, event, actor, details = {}) => {
  await db.deliveryTimeline.create({
    data: { orderId, event, actor, details: JSON.stringify(details), timestamp: new Date() },
  })
}

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '')
  let normalized
  if (digits.startsWith('0'))   normalized = '254' + digits.slice(1)
  else if (digits.startsWith('254')) normalized = digits
  else throw new Error(`Invalid phone: ${phone}`)
  if (!/^254\d{9}$/.test(normalized)) throw new Error(`Invalid phone: ${phone}`)
  return normalized
}

// ─── 1. CREATE DELIVERY ORDER ────────────────────
const createDeliveryOrder = async ({ buyerId, deliveryGuyPhone, amount, goods, productDescription, address, deliveryTime }) => {
  const normalizedPhone = normalizePhone(deliveryGuyPhone)
  const order = await prisma.deliveryOrder.create({
    data: {
      buyerId,
      deliveryGuyPhone: normalizedPhone,
      amount:           new Decimal(amount),
      goods,
      productDescription: productDescription || null,
      address,
      setDeliveryTime:       new Date(deliveryTime),
      originalDeliveryTime: new Date(deliveryTime),
      status:           'PENDING_PAYMENT',
    },
  })


  

  await logTimeline(prisma, order.id, 'ORDER_CREATED', 'BUYER', { amount, goods, address })
  const deliveryGuyUser = await prisma.user.findUnique({
  where: { phone: normalizedPhone },
  select: { id: true }
})
 if (deliveryGuyUser) {
  await createAndSend({
    userId:    deliveryGuyUser.id,
    type:      'NEW_DELIVERY_ORDER',
    messageEn: `New delivery job! Goods: ${goods}. Amount: KES ${amount}. Upload a BEFORE photo to accept.`,
    channel:   'push',
    deliveryOrderId:   order.id,
  }).catch(e => logger.warn('Push failed: createDeliveryOrder', { e: e.message }))
}

  // SMS to delivery guy
  await smsQueue.add('send-sms', {
    to:      normalizedPhone,
    message: `LipaSafe: New delivery from buyer. Goods: ${goods}. Amount: KES ${amount}. Upload a BEFORE photo in the app to accept this job.`,
  })

  logger.info('Delivery order created', { orderId: order.id, buyerId, deliveryGuyPhone: normalizedPhone })
  return { success: true, orderId: order.id }
}


const uploadBeforePhoto = async ({ orderId, deliveryGuyPhone, photos }) => {
  // ─── 1. Validate order exists
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error(`Order not found: ${orderId}`)

  if (order.status !== 'PENDING_PHOTO_UPLOAD')
    throw new Error(`Invalid status: expected PENDING_PHOTO_UPLOAD, got ${order.status}`)

  if (normalizePhone(order.deliveryGuyPhone) !== normalizePhone(deliveryGuyPhone))
    throw new Error(`Unauthorized: phone mismatch for order ${orderId}`)

  // ─── 2. Transaction with proper error wrapping
  try {
    await prisma.$transaction(async (db) => {
      // delete previous BEFORE photos (handles re-upload after buyer rejection)
      await db.deliveryPhoto.deleteMany({ where: { orderId, photoType: 'BEFORE' } })
      // insert all photos in one shot, indexed from 0
      await db.deliveryPhoto.createMany({
        data: photos.map(({ cloudinaryUrl, cloudinaryPublicId }, i) => ({
          orderId,
          photoType:         'BEFORE',
          photoIndex:        i,
          cloudinaryUrl,
          cloudinaryPublicId,
          uploadedBy:        'DELIVERY_GUY',
          uploadedAt:        new Date(),
          latitude:          null,
          longitude:         null,
          deviceId:          null,
        })),
      })

      await db.deliveryOrder.update({
        where: { id: orderId },
        data:  { status: 'PHOTO_WAITING_BUYER_CONFIRMATION' },
      })

      await logTimeline(db, orderId, 'BEFORE_PHOTO_UPLOADED', 'DELIVERY_GUY', {
        photoCount: photos.length,
        primaryUrl: photos[0].cloudinaryUrl,
      })
    })
  } catch (txErr) {
    //  Prisma transaction errors are often wrapped — unwrap them
    logger.error('uploadBeforePhoto transaction failed', {
      orderId,
      error:  txErr.message,
      code:   txErr.code,      
      meta:   txErr.meta,       
      stack:  txErr.stack,
    })
    throw new Error(`Transaction failed: ${txErr.message}`)
  }

  // ─── 3. Safe buyer fetch + SMS
  const buyer = await prisma.user.findUnique({
    where:  { id: order.buyerId },
    select: { phone: true, fullName: true },
  })

  if (!buyer) {
    // Don't crash the whole upload just because SMS can't send
    logger.warn('uploadBeforePhoto: buyer not found for SMS', { buyerId: order.buyerId, orderId })
  } else {
    try {
      await smsQueue.add('send-sms', {
        to:      normalizePhone(buyer.phone),
        message: `LipaSafe: Your delivery guy has uploaded a BEFORE photo of your goods (${order.goods}). Open the app to confirm or reject it.`,
      })
await createAndSend({
  userId:    order.buyerId,
  type:      'BEFORE_PHOTO_UPLOADED',
  messageEn: `Your delivery guy uploaded a BEFORE photo of your ${order.goods}. Open the app to confirm or reject.`,
  channel:   'push',
  deliveryOrderId: orderId,
}).catch(e => logger.warn('Push failed: uploadBeforePhoto', { e: e.message }))

    } catch (smsErr) {
      //  SMS failure should NOT roll back a successful photo upload
      logger.error('uploadBeforePhoto: SMS queue failed', {
        orderId,
        buyerId: order.buyerId,
        error:   smsErr.message,
      })
      // Don't rethrow — photo upload succeeded
    }
  }

  logger.info('Before photo uploaded', { orderId })
  return { success: true, message: 'Photo uploaded. Buyer notified for confirmation.' }
}

// ─── 3. BUYER CONFIRMS BEFORE PHOTO ─────────────
const buyerConfirmsBeforePhoto = async ({ orderId, buyerId, confirmed }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.buyerId !== buyerId) throw new Error('Unauthorized')
  if (order.status !== 'PHOTO_WAITING_BUYER_CONFIRMATION') throw new Error(`Invalid status: ${order.status}`)

  if (!confirmed) {
    await prisma.$transaction(async (db) => {
      await db.deliveryOrder.update({ where: { id: orderId }, data: { status: 'PENDING_PHOTO_UPLOAD' } })
      await logTimeline(db, orderId, 'BEFORE_PHOTO_REJECTED', 'BUYER', {})
    })
    await smsQueue.add('send-sms', {
      to:      normalizePhone(order.deliveryGuyPhone),
      message: `LipaSafe: Buyer rejected your BEFORE photo for order ${orderId}. Please upload a clearer photo in the app.`,
    })
    const dgUserRej = await prisma.user.findUnique({
      where: { phone: normalizePhone(order.deliveryGuyPhone) }, select: { id: true }
    })
    if (dgUserRej) {
      await createAndSend({
        userId:    dgUserRej.id,
        type:      'BEFORE_PHOTO_REJECTED',
        messageEn: `Buyer rejected your BEFORE photo. Please upload a clearer one.`,
        channel:   'push',
        deliveryOrderId: orderId,
      }).catch(e => logger.warn('Push failed: photoRejected', { e: e.message }))
    }
    return { success: true, message: 'Photo rejected. Delivery guy notified.' }
  }

  // Confirmed — generate PICKUP OTP
  const otp       = generateOTP()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)

  await prisma.$transaction(async (db) => {
    await db.deliveryPhoto.updateMany({
      where: { orderId, photoType: 'BEFORE' },
      data:  { buyerConfirmedAt: new Date() },
    })
    await db.deliveryOTP.create({
      data: { orderId, otp, otpType: 'PICKUP', expiresAt, attempts: 0, isValid: true, enteredBy: null },
    })
    await db.deliveryOrder.update({
      where: { id: orderId },
      data:  { status: 'PHOTO_CONFIRMED_BY_BUYER' },
    })
    await logTimeline(db, orderId, 'BEFORE_PHOTO_CONFIRMED', 'BUYER', {})
  })

  await smsQueue.add('send-sms', {
    to:      normalizePhone(order.deliveryGuyPhone),
    message: `LipaSafe: Buyer confirmed your photos! Your PICKUP OTP is: ${otp}. Enter it in the app to start delivery. Expires in 10 mins.`,
  })
  const dgUserConf = await prisma.user.findUnique({
    where: { phone: normalizePhone(order.deliveryGuyPhone) }, select: { id: true }
  })
  if (dgUserConf) {
    await createAndSend({
      userId:    dgUserConf.id,
      type:      'PICKUP_OTP_ISSUED',
      messageEn: `Buyer confirmed your photos! Your PICKUP OTP is: ${otp}. Enter it to start delivery.`,
      channel:   'push',
      deliveryOrderId: orderId,
    }).catch(e => logger.warn('Push failed: pickupOTP', { e: e.message }))
  }

  logger.info('Before photo confirmed, OTP sent', { orderId })
  return { success: true, message: 'OTP sent to delivery guy.' }
}
// ─── 4. DELIVERY GUY ENTERS PICKUP OTP ──────────
const enterPickupOTP = async ({ orderId, deliveryGuyPhone, otp }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (normalizePhone(order.deliveryGuyPhone) !== normalizePhone(deliveryGuyPhone)) throw new Error('Unauthorized')

  const otpRecord = await prisma.deliveryOTP.findFirst({
    where: { orderId, otpType: 'PICKUP', isValid: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!otpRecord) throw new Error('No valid OTP found')
  if (otpRecord.attempts >= 3) throw new Error('Max OTP attempts exceeded')
  if (new Date() > otpRecord.expiresAt) throw new Error('OTP expired')

  const timerEnd = new Date(order.setDeliveryTime)

  // Atomic claim — wrong OTP and correct OTP both handled in one updateMany
  // Prevents race: burst wrong-OTP requests can't all increment before lockout
  const claimed = await prisma.deliveryOTP.updateMany({
    where: {
      id:      otpRecord.id,
      isValid: true,
      attempts: { lt: 3 },
    },
    data: {
      attempts:  { increment: 1 },
      isValid:   otpRecord.otp === otp ? false : true,
      enteredAt: otpRecord.otp === otp ? new Date() : null,
    },
  })
  if (claimed.count === 0) throw new Error('OTP already used or max attempts reached')

  if (otpRecord.otp !== otp) {
    const remaining = 3 - (otpRecord.attempts + 1)
    return { success: false, message: 'Invalid OTP', attemptsRemaining: remaining }
  }

  await prisma.$transaction(async (db) => {
    await db.deliveryOrder.update({
      where: { id: orderId },
      data:  { status: 'IN_TRANSIT' },
    })
    await logTimeline(db, orderId, 'PICKUP_OTP_CONFIRMED', 'DELIVERY_GUY', { timerEnd })
  })

  // Notify both sides
  const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
  await smsQueue.add('send-sms', {
    to:      normalizePhone(buyer.phone),
    message: `LipaSafe: Your delivery has started! Delivery guy is on the way with your ${order.goods}. Expected by ${timerEnd.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true })}.`,
  })
  await smsQueue.add('send-sms', {
    to:      normalizePhone(order.deliveryGuyPhone),
    message: `LipaSafe: Timer started! Deliver ${order.goods} by ${timerEnd.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true })}. Upload a DURING photo when you arrive.`,
  })

  await createAndSend({
  userId:    order.buyerId,
  type:      'DELIVERY_STARTED',
  messageEn: `Your delivery has started! Delivery guy is on the way with your ${order.goods}.`,
  channel:   'push',
  deliveryOrderId: orderId,
}).catch(e => logger.warn('Push failed: enterPickupOTP', { e: e.message }))

  logger.info('Pickup OTP confirmed, timer started', { orderId, timerEnd })
  return { success: true, timerEnd: timerEnd.toISOString() }
}

// ─── 5. UPLOAD DURING PHOTO ──────────────────────
const uploadDuringPhoto = async ({ orderId, deliveryGuyPhone, photos }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.status !== 'IN_TRANSIT') throw new Error(`Invalid status: ${order.status}`)
  if (normalizePhone(order.deliveryGuyPhone) !== normalizePhone(deliveryGuyPhone)) throw new Error('Unauthorized')

  await prisma.$transaction(async (db) => {
      await db.deliveryPhoto.deleteMany({ where: { orderId, photoType: 'DURING' } })
      await db.deliveryPhoto.createMany({
        data: photos.map(({ cloudinaryUrl, cloudinaryPublicId }, i) => ({
          orderId,
          photoType:         'DURING',
          photoIndex:        i,
          cloudinaryUrl,
          cloudinaryPublicId,
          uploadedBy:        'DELIVERY_GUY',
          uploadedAt:        new Date(),
          latitude:          null,
          longitude:         null,
          deviceId:          null,
        })),
      })
      await db.deliveryOrder.update({ where: { id: orderId }, data: { status: 'DELIVERY_PHOTO_UPLOADED' } })
      await logTimeline(db, orderId, 'DURING_PHOTO_UPLOADED', 'DELIVERY_GUY', {
        photoCount: photos.length,
        primaryUrl: photos[0].cloudinaryUrl,
      })
  })

  // Generate DELIVERY OTP for buyer
  const otp       = generateOTP()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)
  await prisma.deliveryOTP.create({
    data: { orderId, otp, otpType: 'DELIVERY', expiresAt, attempts: 0, isValid: true, enteredBy: null },
  })
  await prisma.deliveryOrder.update({ where: { id: orderId }, data: { status: 'RECEIPT_OTP_ISSUED' } })

  // Send OTP to buyer only
  const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
  await smsQueue.add('send-sms', {
    to:      normalizePhone(buyer.phone),
    message: `LipaSafe: Your delivery has arrived! Your receipt OTP is: ${otp}. Enter it in the app to confirm receipt and release payment. Expires in 10 mins.`,
  })
await createAndSend({
  userId:    order.buyerId,
  type:      'RECEIPT_OTP_ISSUED',
  messageEn: `Your delivery has arrived! Your receipt OTP is: ${otp}. Enter it to confirm and release payment.`,
  channel:   'push',
  deliveryOrderId: orderId,
}).catch(e => logger.warn('Push failed: uploadDuringPhoto', { e: e.message }))
  logger.info('During photo uploaded, receipt OTP sent to buyer', { orderId })
  return { success: true, message: 'During photo uploaded. Receipt OTP sent to buyer.' }
}

// ─── 6. BUYER VERIFIES RECEIPT OTP ───────────────
const verifyReceiptOTP = async ({ orderId, buyerId, otp }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.buyerId !== buyerId) throw new Error('Unauthorized')

  const otpRecord = await prisma.deliveryOTP.findFirst({
    where: { orderId, otpType: 'DELIVERY', isValid: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!otpRecord) throw new Error('No valid OTP found')
  if (otpRecord.attempts >= 3) throw new Error('Max OTP attempts exceeded')
  if (new Date() > otpRecord.expiresAt) throw new Error('OTP expired')
  // Atomic claim — wrong OTP and correct OTP both handled in one updateMany
  const claimed = await prisma.deliveryOTP.updateMany({
    where: {
      id:      otpRecord.id,
      isValid: true,
      attempts: { lt: 3 },
    },
    data: {
      attempts:  { increment: 1 },
      isValid:   otpRecord.otp === otp ? false : true,
      enteredAt: otpRecord.otp === otp ? new Date() : null,
    },
  })
  if (claimed.count === 0) throw new Error('OTP already used or max attempts reached')

  if (otpRecord.otp !== otp) {
    const remaining = 3 - (otpRecord.attempts + 1)
    return { success: false, message: 'Invalid OTP', attemptsRemaining: remaining }
  }

  await prisma.$transaction(async (db) => {
    await db.deliveryOrder.update({ where: { id: orderId }, data: { status: 'AWAITING_RECEIPT' } })
    await logTimeline(db, orderId, 'RECEIPT_OTP_CONFIRMED', 'BUYER', {})
  })

  logger.info('Receipt OTP confirmed', { orderId })
  return { success: true, message: 'OTP confirmed. Click received to release payment.' }
}

// ─── 7. UPLOAD AFTER PHOTO ────────────────────────
const uploadAfterPhoto = async ({ orderId, buyerId, cloudinaryUrl, cloudinaryPublicId }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.buyerId !== buyerId) throw new Error('Unauthorized')

  await prisma.deliveryPhoto.deleteMany({ where: { orderId, photoType: 'AFTER' } })
  await prisma.deliveryPhoto.create({
    data: {
      orderId,
      photoType:         'AFTER',
      photoIndex:        0,
      cloudinaryUrl,
      cloudinaryPublicId,
      uploadedBy:        'BUYER',
      uploadedAt:        new Date(),
    },
  })
  await logTimeline(prisma, orderId, 'AFTER_PHOTO_UPLOADED', 'BUYER', { cloudinaryUrl })

  return { success: true, message: 'After photo uploaded.' }
}


// ─── DELIVERY B2C PAYOUT ─────────────────────────────────────────────────────
const deliveryB2cPayout = async (orderId, phone, amount, type = 'payout') => {
  const baseURL  = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke'
  const idempKey = `delivery:b2c:originator:fixed:${orderId}`

  // Pin one UUID per orderId — Redis NX ensures first writer wins
  // Falls back to DB if Redis evicts the key after 24hrs
  let originatorId = await redis.get(idempKey)
  if (!originatorId) {
    const existingOrder = await prisma.deliveryOrder.findUnique({
      where:  { id: orderId },
      select: { b2cOriginatorId: true },
    })
    if (existingOrder?.b2cOriginatorId) {
      originatorId = existingOrder.b2cOriginatorId
      logger.info('deliveryB2cPayout: recovered originatorId from DB', { orderId, originatorId })
    } else {
      originatorId = crypto.randomUUID()
      await prisma.deliveryOrder.update({
        where: { id: orderId },
        data:  { b2cOriginatorId: originatorId },
      })
    }
    await redis.set(idempKey, originatorId, 'EX', 86400)
  }
  const attempt = await redis.incr(`delivery:b2c:attempt:${orderId}`)
  await redis.set(
    `delivery:b2c:originator:${originatorId}`,
    JSON.stringify({ orderId, type, attempt }),
    'EX', 86400
  )
  const token = await getToken()
  const normalizedPhone = normalizePhone(phone)
  let res
  try {
    res = await axios.post(`${baseURL}/mpesa/b2c/v3/paymentrequest`, {
      OriginatorConversationID: originatorId,
      InitiatorName:            process.env.MPESA_B2C_INITIATOR_NAME,
      SecurityCredential:       process.env.MPESA_B2C_SECURITY_CREDENTIAL,
      CommandID:                'BusinessPayment',
      Amount:                   new Decimal(amount).toDecimalPlaces(0).toNumber(),
      PartyA:                   process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE,
      PartyB:                   normalizedPhone,
      Remarks:                  `LipaSafe delivery ${orderId}`,
      QueueTimeOutURL:          process.env.MPESA_DELIVERY_B2C_TIMEOUT_URL,
      ResultURL:                process.env.MPESA_DELIVERY_B2C_RESULT_URL,
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })
  } catch (err) {
    const errCode = err?.response?.data?.errorCode || err?.response?.data?.data?.errorCode
    if (errCode === '500.002.1001') {
      logger.warn('Delivery B2C duplicate OriginatorConversationID — already processed, treating as success', { orderId, originatorId })
      return { ResponseCode: '0', ResponseDescription: 'Duplicate — already processed', OriginatorConversationID: originatorId }
    }
    throw err
  }
  logger.info('Delivery B2C payout initiated', { orderId, phone: normalizedPhone, originatorId })
  console.log('SAFARICOM B2C RESPONSE:', JSON.stringify(res.data))
  return res.data
}

// ─── 8. MARK RECEIVED & RELEASE PAYMENT ──────────
const markReceived = async ({ orderId, buyerId }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.buyerId !== buyerId) throw new Error('Unauthorized')
  if (order.status !== 'AWAITING_RECEIPT') throw new Error(`Invalid status: ${order.status}`)

  // Check high risk
  const riskProfile = await prisma.deliveryGuyRiskProfile.findUnique({
    where: { phone: order.deliveryGuyPhone },
  })
  const isHighRisk = riskProfile && riskProfile.riskLevel === 'HIGH'

  if (isHighRisk) {
    const afterPhoto = await prisma.deliveryPhoto.findFirst({
      where: { orderId, photoType: 'AFTER' },
    })
    if (!afterPhoto) throw new Error('AFTER_PHOTO_REQUIRED')
  }

  // Atomic claim — only one concurrent call can flip AWAITING_RECEIPT -> PAYMENT_PROCESSING
  const claimed = await prisma.deliveryOrder.updateMany({
    where: { id: orderId, status: 'AWAITING_RECEIPT' },
    data:  { status: 'PAYMENT_PROCESSING' },
  })
  if (claimed.count === 0) throw new Error('Order already being processed or not in AWAITING_RECEIPT state')
  await logTimeline(prisma, orderId, 'BUYER_MARKED_RECEIVED', 'BUYER', {})

  // Queue payout — avoids timeout + double-payment risk on direct call
  await b2cRetryQueue.add('delivery-payout', {
    orderId,
    phone:  order.deliveryGuyPhone,
    amount: order.amount.toString(),
    type:   'delivery-payout',
  }, {
    jobId: `delivery-payout-${orderId}`,
    attempts: 10,
    backoff: { type: 'exponential', delay: 5000 },
  })
  const dgUserPay = await prisma.user.findUnique({
  where: { phone: order.deliveryGuyPhone }, select: { id: true }
})
if (dgUserPay) {
  await createAndSend({
    userId:    dgUserPay.id,
    type:      'PAYMENT_RELEASED',
    messageEn: `Buyer confirmed receipt. KES ${order.amount} is being sent to your M-Pesa.`,
    channel:   'push',
    deliveryOrderId: orderId,
  }).catch(e => logger.warn('Push failed: markReceived', { e: e.message }))
}
  logger.info('Delivery B2C payout queued', { orderId, amount: order.amount })
  return { success: true, message: 'Payment processing.' }
}

// ─── 9. EXTEND DELIVERY TIME ──────────────────────
const extendDeliveryTime = async ({ orderId, buyerId, extensionMinutes }) => {
  if (![10, 20, 30].includes(extensionMinutes)) throw new Error('Extension must be 10, 20, or 30 minutes')
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.buyerId !== buyerId) throw new Error('Unauthorized')
  if (order.status !== 'IN_TRANSIT') throw new Error(`Cannot extend delivery time: order is ${order.status}, expected IN_TRANSIT`)

  const newDeadline = new Date(order.setDeliveryTime.getTime() + extensionMinutes * 60 * 1000)

  await prisma.$transaction(async (db) => {
    await db.deliveryOrder.update({
      where: { id: orderId },
      data:  {
        setDeliveryTime:  newDeadline,
        extensionCount:   { increment: 1 },
        status:           'IN_TRANSIT',
      },
    })
    await logTimeline(db, orderId, 'DELIVERY_EXTENDED', 'BUYER', { extensionMinutes, newDeadline })
  })

  const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
  await smsQueue.add('send-sms', {
    to:      normalizePhone(order.deliveryGuyPhone),
    message: `LipaSafe: Buyer extended your delivery time by ${extensionMinutes} mins. New deadline: ${newDeadline.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true })}.`,
  })

  return { success: true, newDeadline: newDeadline.toISOString() }
}

// ─── 10. OPEN DISPUTE ─────────────────────────────
const DISPUTABLE_STATUSES = ['DELIVERY_PHOTO_UPLOADED', 'RECEIPT_OTP_ISSUED']

const openDispute = async ({ orderId, claimerType, reason, claimerId }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  if (!DISPUTABLE_STATUSES.includes(order.status))
    throw new Error(`Cannot raise dispute at this stage. Order status is: ${order.status}`)

  const existing = await prisma.deliveryDispute.findUnique({ where: { orderId } })
  if (existing) throw new Error('Dispute already exists for this order')

  const dispute = await prisma.$transaction(async (db) => {
    const d = await db.deliveryDispute.create({
      data: {
        orderId,
        claimerType,
        reason,
        status: 'OPEN',
      },
    })
    await db.deliveryOrder.update({ where: { id: orderId }, data: { status: 'DISPUTED' } })
    await logTimeline(db, orderId, 'DISPUTE_OPENED', claimerType, { reason })
    return d
  })

  logger.info('Dispute opened', { orderId, disputeId: dispute.id, claimerType })
  return { success: true, disputeId: dispute.id }
}

// ─── 11. SUBMIT RATING ────────────────────────────
const submitRating = async ({ orderId, buyerId, rating, review }) => {
  const order = await prisma.deliveryOrder.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')
  if (order.buyerId !== buyerId) throw new Error('Unauthorized')
  if (order.status !== 'COMPLETED') throw new Error('Order not completed yet')

  await prisma.deliveryRating.create({
    data: { orderId, rating, review: review || null, timestamp: new Date() },
  })

  logger.info('Rating submitted', { orderId, rating })
  return { success: true, message: 'Rating submitted.' }
}

// ─── 12. GET HIGH RISK STATUS ─────────────────────
const getHighRiskStatus = async (deliveryGuyPhone) => {
  const normalized = normalizePhone(deliveryGuyPhone)
  const profile = await prisma.deliveryGuyRiskProfile.findUnique({
    where: { phone: normalized },
  })
  if (!profile || profile.totalDisputes < HIGH_RISK_THRESHOLD) {
    return { isHighRisk: false, disputeCount: profile?.totalDisputes || 0 }
  }
  return {
    isHighRisk:    true,
    riskLevel:     profile.riskLevel,
    disputeCount:  profile.totalDisputes,
    lastDisputeAt: profile.lastDisputeAt,
  }
}

// ─── 13. GET DELIVERY HISTORY ─────────────────────
const getDeliveryHistory = async ({ userId, phone, type, limit = 20, offset = 0 }) => {
  const where = type === 'buyer'
    ? { buyerId: userId,                        deletedAt: null }
    : { deliveryGuyPhone: normalizePhone(phone), deletedAt: null }

  const orders = await prisma.deliveryOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take:    parseInt(limit),
    skip:    parseInt(offset),
    include: {
      photos:  { select: { photoType: true, cloudinaryUrl: true } },
      rating:  { select: { rating: true } },
      dispute: { select: { status: true } },
      buyer:   { select: { phone: true, fullName: true } },
    },
  })
  return { success: true, orders }
}

const getUserPhones = async (userId) => {
  console.log('getUserPhones called with:', userId)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
  return user ? [normalizePhone(user.phone)] : []
}

module.exports = {
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
  normalizePhone,
  deliveryB2cPayout,
}
