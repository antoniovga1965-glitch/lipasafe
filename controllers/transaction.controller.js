'use strict'
const { z } = require('zod')
const { getToken } = require('../src/utils/mpesaToken');
const Decimal = require('decimal.js')
const axios   = require('axios')
const crypto  = require('crypto')
const prisma  = require('../src/utils/prisma')
  const { createAndSend } = require('../src/services/notificationService')
const logger  = require('../src/utils/logger')
const smsQueue = require('../src/queues/smsQueue')
const timerQueue = require('../src/queues/timerQueue')
const {
  findOrCreateSeller, scheduleTimer, cancelTimer,
  releaseFunds, refundBuyer, normalizePhone, generateRef,
  generateOtp,
  PLATFORM_FEE_RATE, PAYMENT_EXPIRY_DELAY, DELIVERY_REMINDER_DELAY,
  AUTO_RELEASE_DELAY, DISPUTE_DEADLINE_DELAY, OTP_WINDOW
} = require('../src/services/bundleService');

const { calcFees, b2cCost, b2bCost } = require('../src/utils/feeCalculator');

const isSandbox = process.env.MPESA_ENV === 'sandbox'
const baseURL   = isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke'


// ─── INITIATE ────────────────────────────────────
const InitiateSchema = z.object({
  sellerPhone:  z.string().optional(),
  amount:       z.coerce.number().min(1, 'Minimum amount is KES 1').max(50000),
  description:  z.string().max(100).optional(),
  method:       z.enum(['pochi', 'till']),
  sellerTill:   z.string().optional(),
  notifyPhone:  z.string().optional()
}).superRefine((data, ctx) => {
  if (data.method === 'pochi') {
    if (!data.sellerPhone) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Seller phone is required for Pochi', path: ['sellerPhone'] })
    } else if (!/^(?:254|0|\+254)?[17]\d{8}$/.test(data.sellerPhone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid seller phone number', path: ['sellerPhone'] })
    }
  }
  if (data.method === 'till') {
    if (!data.sellerTill) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Till number is required', path: ['sellerTill'] })
    } else if (!/^\d{5,10}$/.test(data.sellerTill)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid till number', path: ['sellerTill'] })
    }
  }
})

const initiate = async (req, res) => {
  try {
    const parsed = InitiateSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message })

    const { sellerPhone: rawPhone, amount, description, method, sellerTill, notifyPhone: rawNotifyPhone } = parsed.data
    const buyerId = req.user.userId

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true, accountStatus: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'User not found' })
    if (buyer.accountStatus !== 'active') return res.status(403).json({ success: false, message: 'Account inactive' })

    let sellerPhone, seller
    if (method === 'till') {
      // Till payment — use till number as identifier, create ghost seller keyed to till
      sellerPhone = `till_${sellerTill}`
      seller = await prisma.user.findFirst({ where: { phone: sellerPhone } })
      if (!seller) {
        seller = await prisma.user.create({
          data: {
            phone: sellerPhone,
            email: `ghost_till_${sellerTill}_${require('crypto').randomUUID()}@lipasafe.internal`,
            fullName: `Till ${sellerTill}`,
            pinHash: 'GHOST_NO_LOGIN',
            role: 'seller',
            accountStatus: 'suspended',
            kycStatus: 'unverified',
            wallet: { create: { isGhost: true } }
          }
        })
      }
    } else {
      sellerPhone = normalizePhone(rawPhone)
      if (buyer.phone === sellerPhone || normalizePhone(buyer.phone) === sellerPhone) {
        return res.status(400).json({ success: false, message: 'Cannot transact with yourself' })
      }
      seller = await findOrCreateSeller(sellerPhone)
    }

    const parsedAmount     = new Decimal(amount)
    const fees             = calcFees(parsedAmount)
    const rawPlatformFee   = fees.platformFee
    const disbursementCost = method === 'till'
      ? new Decimal(b2bCost(parsedAmount))
      : new Decimal(b2cCost(parsedAmount))
    const rawBuyerPays     = parsedAmount.plus(rawPlatformFee).plus(disbursementCost).toDecimalPlaces(2)
    const buyerPays        = rawBuyerPays.toDecimalPlaces(0, Decimal.ROUND_CEIL)
    const platformFee      = buyerPays.minus(parsedAmount).minus(disbursementCost)
    const sellerReceives   = parsedAmount.toFixed(2)
    const stkAmount        = buyerPays.toNumber()

    const referenceNo    = generateRef()
    const idempotencyKey = crypto.randomUUID()

    // Create transaction (initiated)
    const transaction = await prisma.transaction.create({
      data: {
        referenceNo, idempotencyKey,
        buyerId, sellerId: seller.id,
        amount:        buyerPays.toFixed(2),
        platformFee:   platformFee.toFixed(2),
        sellerReceives: sellerReceives,
        category: 'bundles',
        description: description || `Bundles – KES ${amount}`,
        state: 'initiated',
        buyerPhone: buyer.phone,
        sellerTill: sellerTill || null,
        notifyPhone: method === 'till'
          ? (rawNotifyPhone ? normalizePhone(rawNotifyPhone) : null)
          : (method === 'pochi' ? normalizePhone(rawPhone) : null),
        paymentDeadline: new Date(Date.now() + PAYMENT_EXPIRY_DELAY)
      }
    })

    // STK push
    const stkShortcode = process.env.MPESA_STK_SHORTCODE || process.env.MPESA_SHORTCODE
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const password  = Buffer.from(`${stkShortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64')
    const token     = await getToken()

    const mpesaRes = await axios.post(`${baseURL}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: stkShortcode,
      Password: password, Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: stkAmount,
      PartyA: normalizePhone(buyer.phone), PartyB: stkShortcode, PhoneNumber: normalizePhone(buyer.phone),
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: `LS-${referenceNo}`,
      TransactionDesc: `Bundle payment ${referenceNo}`
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 })

    if (mpesaRes.data.ResponseCode !== '0') {
      await prisma.transaction.update({ where: { id: transaction.id }, data: { state: 'cancelled' } })
      return res.status(400).json({ success: false, message: mpesaRes.data.ResponseDescription || 'STK push failed' })
    }

    const { CheckoutRequestID, MerchantRequestID } = mpesaRes.data

    // MpesaTransaction record
    await prisma.mpesaTransaction.create({
      data: {
        userId: buyerId,
        checkoutRequestId: CheckoutRequestID,
        merchantRequestId: MerchantRequestID,
        amount: buyerPays.toFixed(2),
        fee: fees.platformFee.toFixed(2),
        phone: buyer.phone,
        status: 'pending',
        idempotencyKey: crypto.randomUUID()
      }
    })

    // Link checkout ID to transaction
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { state: 'payment_pending', mpesaCheckoutId: CheckoutRequestID }
    })

    // Schedule payment expiry
    await scheduleTimer(timerQueue, transaction.id, 'payment_expiry', PAYMENT_EXPIRY_DELAY)

    logger.info('Bundle initiated', { transactionId: transaction.id, buyerId, sellerPhone, amount })
    if (!seller.wallet?.isGhost) {
      const { createAndSend: _bn1 } = require('../src/services/notificationService')
      _bn1({ userId: seller.id, type: 'payment_received', messageEn: `New bundle order! KES ${amount} held in escrow. Deliver to release payment. Ref: ${referenceNo}.`, transactionId: transaction.id }).catch(() => {})
    }

    return res.json({
      success: true,
      transactionId: transaction.id,
      referenceNo,
      checkoutRequestId: CheckoutRequestID,
      message: 'Enter M-Pesa PIN to complete payment.'
    })
  } catch (err) {
    logger.error('initiate failed', { err: err.message, stack: err.stack }); console.error('SAFARICOM ERROR:', JSON.stringify(err.response?.data))
    return res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message })
  }
}

// ─── POLL STATUS ─────────────────────────────────
const pollBundleStatus = async (req, res) => {
  try {
    const { id } = req.params
    const buyerId = req.user.userId
    const tx = await prisma.transaction.findFirst({
      where: { id, buyerId },
      select: { id: true, state: true, referenceNo: true, amount: true, description: true, createdAt: true }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    return res.json({ success: true, transaction: tx })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── SELLER: MARK DELIVERED ──────────────────────
const sellerDeliver = async (req, res) => {
  try {
    const { id } = req.params
    const sellerId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: sellerId }, select: { phone: true } })
    const normalizedPhone = normalizePhone(user.phone)

    const tx = await prisma.transaction.findFirst({
      where: {
        id,
        OR: [{ sellerId }, { notifyPhone: normalizedPhone }]
      },
      include: { buyer: { select: { phone: true } }, seller: { select: { phone: true } } }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    if (tx.state !== 'held') return res.status(400).json({ success: false, message: `Cannot deliver — state is ${tx.state}` })

    const otp = generateOtp()
    const otpExpiresAt = new Date(Date.now() + OTP_WINDOW)

    await prisma.transaction.update({
      where: { id },
      data: {
        state: 'delivered',
        deliveryNotes: req.body?.notes || null,
        deliveredAt: new Date(),
        confirmationDeadline: new Date(Date.now() + AUTO_RELEASE_DELAY),
        otpCode: otp,
        otpExpiresAt,
        otpVerifiedAt: null,
        smsDeliveryStatus: 'pending'
      }
    })
    await prisma.auditLog.create({
      data: {
        actorId: sellerId, actorType: 'user', action: 'seller_marked_delivered',
        entityType: 'Transaction', entityId: id,
        newState: { state: 'delivered' }, transactionId: id
      }
    })

    await cancelTimer(timerQueue, id, 'delivery_reminder')
    await cancelTimer(timerQueue, id, 'seller_delivery_deadline')
    await scheduleTimer(timerQueue, id, 'auto_release', AUTO_RELEASE_DELAY)

    await smsQueue.add('bundle_otp', {
      type: 'bundle_otp',
      phone: tx.buyer.phone,
      transactionId: id,
      referenceNo: tx.referenceNo,
      otp
    })

    // Push counterpart — gives handleInspectionDeadline a real, Expo-confirmed
    // delivery signal to check before auto-releasing on buyer silence, instead
    // of trusting silence with zero verification that the OTP even arrived.
  
    await createAndSend({
      userId: tx.buyerId,
      type: 'bundle_otp',
      transactionId: id,
      messageEn: `Seller has delivered your order. Enter OTP ${otp} in the app to confirm and release funds. Ref: ${tx.referenceNo}.`
    }).catch(err => logger.warn('bundle_otp push notification failed', { transactionId: id, err: err.message }))

    return res.json({ success: true, message: 'Delivery marked. OTP sent to buyer.' })
  } catch (err) {
    logger.error('sellerDeliver failed', { err: err.message })
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── SELLER: REJECT ORDER ────────────────────────
const sellerReject = async (req, res) => {
  try {
    const { id } = req.params
    const sellerId = req.user.userId
    const userR = await prisma.user.findUnique({ where: { id: sellerId }, select: { phone: true } })
    const normalizedPhoneR = normalizePhone(userR.phone)

    const tx = await prisma.transaction.findFirst({
      where: { id, OR: [{ sellerId }, { notifyPhone: normalizedPhoneR }] }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    if (tx.state !== 'held') return res.status(400).json({ success: false, message: `Cannot reject — state is ${tx.state}` })

    await cancelTimer(timerQueue, id, 'delivery_reminder')
    await refundBuyer(id)
    const { createAndSend: _bn2 } = require('../src/services/notificationService')
    _bn2({ userId: tx.buyerId, type: 'refund_sent', messageEn: `Seller rejected your bundle order. Your KES ${tx.amount} refund is being processed.`, transactionId: id }).catch(() => {})

    await prisma.auditLog.create({
      data: {
        actorId: sellerId, actorType: 'user', action: 'seller_rejected_order',
        entityType: 'Transaction', entityId: id,
        newState: { state: 'refunded' }, transactionId: id
      }
    })

    return res.json({ success: true, message: 'Order rejected. Buyer will be refunded.' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── BUYER: CONFIRM ──────────────────────────────
const ConfirmSchema = z.object({ confirmed: z.boolean() })

const buyerConfirm = async (req, res) => {
  console.log('BUYERCONFIRM HIT body:', JSON.stringify(req.body), 'user:', req.user?.userId)
  try {
    const { id } = req.params
    const buyerId = req.user.userId
    const parsed = ConfirmSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: 'confirmed (boolean) is required' })

    const tx = await prisma.transaction.findFirst({ where: { id, buyerId } })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    if (tx.state !== 'delivered') return res.status(400).json({ success: false, message: `Cannot confirm — state is ${tx.state}` })

    if (parsed.data.confirmed) {
      // Don't release funds yet — buyer must verify OTP first
      // auto_release timer stays alive until verifyOtp cancels it
      return res.json({ success: true, message: 'OTP required. Enter the code sent to your phone.' })
    }

    // Buyer rejected — cancel timer and open dispute
    await cancelTimer(timerQueue, id, 'auto_release')

    if (false) {
      // dead branch — kept for structure
    } else {
      await prisma.transaction.update({ where: { id }, data: { state: 'disputed' } })
      await prisma.dispute.create({
        data: {
          transactionId: id, openedBy: buyerId,
          reason: 'not_delivered',
          description: 'Buyer denied receipt via confirmation prompt',
          status: 'open',
          responseDeadline: new Date(Date.now() + DISPUTE_DEADLINE_DELAY)
        }
      })
      await scheduleTimer(timerQueue, id, 'dispute_deadline', DISPUTE_DEADLINE_DELAY)
      return res.json({ success: true, message: 'Dispute opened. Admin will review within 24 hours.' })
    }
  } catch (err) {
    console.error(err)
    logger.error('buyerConfirm failed', { err: err.message })
    console.error('BUYERCONFIRM FULL ERROR:', err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── OPEN DISPUTE ────────────────────────────────
const DisputeSchema = z.object({
  reason:      z.enum(['not_delivered','wrong_item','damaged_goods','service_incomplete','fraud_suspected','other']),
  description: z.string().min(10).max(500)
})

const openDispute = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId
    const parsed = DisputeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message })

    const tx = await prisma.transaction.findFirst({
      where: { id, OR: [{ buyerId: userId }, { sellerId: userId }], state: { in: ['held', 'delivered'] } }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found or not disputable' })

    await prisma.$transaction(async (db) => {
      await db.transaction.update({ where: { id }, data: { state: 'disputed' } })
      await db.dispute.create({
        data: {
          transactionId: id, openedBy: userId,
          reason: parsed.data.reason, description: parsed.data.description,
          status: 'open', responseDeadline: new Date(Date.now() + DISPUTE_DEADLINE_DELAY)
        }
      })
      await db.auditLog.create({
        data: {
          actorId: userId, actorType: 'user', action: 'dispute_opened',
          entityType: 'Transaction', entityId: id,
          newState: { state: 'disputed', reason: parsed.data.reason }, transactionId: id
        }
      })
    })

    await cancelTimer(timerQueue, id, 'auto_release')
    await cancelTimer(timerQueue, id, 'seller_delivery_deadline')
    await scheduleTimer(timerQueue, id, 'dispute_deadline', DISPUTE_DEADLINE_DELAY)

    return res.json({ success: true, message: 'Dispute opened. Admin will review within 24 hours.' })
  } catch (err) {
    logger.error('openDispute failed', { err: err.message })
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── GET MY TRANSACTIONS ─────────────────────────
const getMyTransactions = async (req, res) => {
  try {
    const userId = req.user.userId
    const { role = 'buyer', limit = 20, offset = 0 } = req.query
    const where = role === 'seller'
      ? { sellerId: userId, category: 'bundles', deletedBySeller: false }
      : { buyerId:  userId, category: 'bundles', deletedByBuyer: false }

    const txs = await prisma.transaction.findMany({
      where, orderBy: { createdAt: 'desc' },
      take: parseInt(limit), skip: parseInt(offset),
      select: {
        id: true, referenceNo: true, amount: true, sellerReceives: true,
        platformFee: true, state: true, description: true,
        createdAt: true, completedAt: true,
        buyer:  { select: { fullName: true, phone: true } },
        seller: { select: { fullName: true, phone: true } }
      }
    })
    return res.json({ success: true, transactions: txs })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ─── SELLER PENDING ORDERS ───────────────────────
const rateSeller = async (req, res) => {
  try {
    const { id } = req.params
    const { rating } = req.body
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be 1-5' })
    const tx = await prisma.transaction.findFirst({
      where: { id, buyerId: req.user.userId, state: 'released' }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    await prisma.user.update({
      where: { id: tx.sellerId },
      data: {
        reputationScore: { increment: rating / 10 },
      }
    })
    await prisma.auditLog.create({
      data: {
        actorId: req.user.userId, actorType: 'user', action: 'buyer_rated_seller',
        entityType: 'Transaction', entityId: id,
        newState: { rating }, transactionId: id
      }
    })
    return res.json({ success: true, message: 'Rating submitted' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

const getSellerPendingOrders = async (req, res) => {
  try {
    const sellerId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: sellerId }, select: { phone: true } })
    const normalizedPhone = normalizePhone(user.phone)

    // Fetch orders where:
    // 1. User is the registered seller (pochi), OR
    // 2. User is the till notifyPhone owner (till payments)
    const orders = await prisma.transaction.findMany({
      where: {
        state: { in: ['held', 'delivered'] },
        category: 'bundles',
        OR: [
          { sellerId },
          { notifyPhone: normalizedPhone }
        ]
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, referenceNo: true, amount: true, sellerReceives: true,
        description: true, createdAt: true, state: true,
        sellerTill: true, notifyPhone: true,
        buyer: { select: { phone: true } }
      }
    })
    return res.json({ success: true, orders })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}


// ─── BUYER: VERIFY OTP ───────────────────────────
const VerifyOtpSchema = z.object({ otp: z.string().length(6) })
const verifyOtp = async (req, res) => {
  try {
    const { id } = req.params
    const buyerId = req.user.userId
    const parsed = VerifyOtpSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    const tx = await prisma.transaction.findFirst({ where: { id, buyerId } })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    if (tx.state !== 'delivered') return res.status(400).json({ success: false, message: 'Cannot verify OTP — state is ' + tx.state })
    if (tx.otpVerifiedAt) return res.status(400).json({ success: false, message: 'OTP already used' })
    if (new Date() > new Date(tx.otpExpiresAt)) return res.status(400).json({ success: false, message: 'OTP expired' })
    if (parsed.data.otp !== tx.otpCode) return res.status(400).json({ success: false, message: 'Invalid OTP' })
    await prisma.transaction.update({
      where: { id },
      data: {
        otpVerifiedAt: new Date(),
        state:         'confirmed',
        completedAt:   new Date(),
        otpCode:       null,
        otpExpiresAt:  null
      }
    })
    await prisma.auditLog.create({ data: { actorId: buyerId, actorType: 'user', action: 'otp_verified', entityType: 'Transaction', entityId: id, newState: { state: 'confirmed', otpVerified: true }, transactionId: id } })
    await cancelTimer(timerQueue, id, 'auto_release')
    await releaseFunds(id)
    const { createAndSend: _bn3 } = require('../src/services/notificationService')
    _bn3({ userId: tx.sellerId, type: 'money_released', messageEn: `Buyer confirmed receipt. KES ${tx.sellerReceives} is being sent to your M-Pesa. Ref: ${tx.referenceNo}.`, transactionId: id }).catch(() => {})
    return res.json({ success: true, message: 'OTP verified. Funds released to seller.' })
  } catch (err) {
    logger.error('verifyOtp failed', { err: err.message, stack: err.stack })
    return res.status(500).json({ success: false, message: err.message })
  }
}




// ─── DELETE TRANSACTION (soft-delete) ────────────────────────────────────────
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId
    const tx = await prisma.transaction.findFirst({
      where: { id, OR: [{ buyerId: userId }, { sellerId: userId }] }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    const isBuyer = tx.buyerId === userId
    await prisma.transaction.update({
      where: { id },
      data: isBuyer ? { deletedByBuyer: true } : { deletedBySeller: true }
    })
    return res.json({ success: true, message: 'Transaction removed from history' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

module.exports = {
  initiate, pollBundleStatus,
  sellerDeliver, sellerReject,
  buyerConfirm, verifyOtp, openDispute,
  getMyTransactions, getSellerPendingOrders, rateSeller,
  deleteTransaction,
}
