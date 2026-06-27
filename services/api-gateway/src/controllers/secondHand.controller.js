'use strict'
const { z }      = require('zod')
const { getToken } = require('../utils/mpesaToken');
const Decimal    = require('decimal.js')
const axios      = require('axios')
const crypto     = require('crypto')
const prisma     = require('../utils/prisma')
const logger     = require('../utils/logger')
const smsQueue   = require('../queues/smsQueue')
const timerQueue = require('../queues/timerQueue')
const {
   normalizePhone, generateRef,
  generateOtp, scheduleTimer, cancelTimer,
  PLATFORM_FEE_RATE, PAYMENT_EXPIRY_DELAY, OTP_WINDOW
} = require('../services/bundleService')
const { calcFeesSecondHand } = require('../utils/feeCalculator')
const { releaseToSeller, refundBuyer } = require('../services/secondHandService')

const isSandbox = process.env.MPESA_ENV === 'sandbox'
const baseURL   = isSandbox
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke'

const safeError = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg })

const VALID_INSPECTION_HOURS = [12, 24, 48, 72]
const SELLER_RESPONSE_WINDOW = 4 * 60 * 60 * 1000  



// ─── SCHEMAS ─────────────────────────────────────
const createListingSchema = z.object({
  title:          z.string().min(3).max(100).trim(),
  condition:      z.enum(['new', 'like_new', 'refurbished', 'good', 'fair', 'faulty']),
  price:          z.coerce.number().positive().max(500000).multipleOf(0.001),
  description:    z.string().max(1000).trim().optional(),
  brand:          z.string().max(50).trim().optional(),
  model:          z.string().max(50).trim().optional(),
  serialNumber:   z.string().max(100).trim().optional(),
  images:         z.array(z.string().url()).min(2, 'At least 2 images required').max(10),
  conditionPhotos: z.array(z.string().url()).max(3).default([]),
})

const buyListingSchema = z.object({
  inspectionHours: z.number()
    .refine(v => VALID_INSPECTION_HOURS.includes(v), {
      message: 'inspectionHours must be 12, 24, 48, or 72'
    })
    .default(24),
  clientRef: z.string().uuid().optional(),
})

const handoverSchema = z.object({
  conditionPhotos: z.array(z.string().url()).max(3).optional(),
  notes:           z.string().max(500).trim().optional(),
})

const disputeSchema = z.object({
  reason:      z.enum(['not_as_described', 'damaged_goods', 'wrong_item', 'fake_or_clone', 'not_delivered', 'other']),
  description: z.string().min(10).max(1000).trim(),
})

const disputeResponseSchema = z.object({
  accepts:    z.preprocess(v => v === 'true' || v === true, z.boolean()),
  sellerNote: z.string().max(1000).trim().optional(),
})

// ─── CREATE LISTING ──────────────────────────────
const createListing = async (req, res) => {
  try {
    const parsed = createListingSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error?.errors?.[0]?.message || 'Invalid request'
      console.error('SCHEMA_ERROR:', JSON.stringify(parsed.error?.errors, null, 2))
      return safeError(res, 400, msg)
    }

    const sellerId = req.user.userId

    const seller = await prisma.user.findUnique({
      where:  { id: sellerId },
      select: { accountStatus: true, wallet: { select: { isGhost: true } } }
    })
    if (!seller)                           return safeError(res, 404, 'User not found')
    if (seller.accountStatus !== 'active') return safeError(res, 403, 'Account is not active')
    if (seller.wallet?.isGhost)            return safeError(res, 403, 'Complete account setup before listing')

    const listing = await prisma.secondHandListing.create({
      data: {
        sellerId,
        title:           parsed.data.title,
        condition:       parsed.data.condition,
        price:           new Decimal(parsed.data.price).toFixed(2),
        description:     parsed.data.description,
        brand:           parsed.data.brand,
        model:           parsed.data.model,
        serialNumber:    parsed.data.serialNumber,
        images:          parsed.data.images,
        conditionPhotos: parsed.data.conditionPhotos,
        status:          'active',
      }
    })

    logger.info('Second hand listing created', { listingId: listing.id, sellerId })
    return res.status(201).json({ success: true, listing })
  } catch (err) {
    logger.error('createListing error', { error: err.message, stack: err.stack })
    console.error('CREATE_LISTING_ERR:', err)
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── GET LISTINGS (public browse) ────────────────
const getListings = async (req, res) => {
  try {
    const { condition, minPrice, maxPrice, page = '1', limit = '20', search } = req.query

    const pageNum  = Math.max(1, parseInt(page))
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)))
    const skip     = (pageNum - 1) * limitNum

    const VALID_CONDITIONS = ['new','like_new','refurbished','good','fair','faulty']

    const where = {
      status: 'active',
      ...(condition && VALID_CONDITIONS.includes(condition) ? { condition } : {}),
      ...(minPrice || maxPrice ? {
        price: {
          ...(minPrice && !isNaN(minPrice) ? { gte: new Decimal(minPrice).toFixed(2) } : {}),
          ...(maxPrice && !isNaN(maxPrice) ? { lte: new Decimal(maxPrice).toFixed(2) } : {}),
        }
      } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
        ]
      } : {})
    }

    const [listings, total] = await Promise.all([
      prisma.secondHandListing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true, title: true, condition: true, price: true,
          brand: true, model: true, images: true, createdAt: true,
          seller: { select: { fullName: true, reputationScore: true } }
        }
      }),
      prisma.secondHandListing.count({ where })
    ])

    return res.json({
      success: true, listings,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    })
  } catch (err) {
    logger.error('getListings error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── GET SINGLE LISTING ──────────────────────────
const getListing = async (req, res) => {
  try {
    const { id } = req.params
    const requesterId = req.user.userId

    const listing = await prisma.secondHandListing.findUnique({
      where:   { id },
      include: {
        seller: {
          select: {
            fullName: true, reputationScore: true,
            sellerProfile: { select: { rating: true, totalEarned: true } }
          }
        },
        transactions: { select: { buyerId: true } },
        transactions: { select: { buyerId: true } }
      }
    })
    if (!listing) return safeError(res, 404, 'Listing not found')

    // Serial number only visible to buyer after escrow started — anti-phishing
    const isBuyerOrSeller =
      listing.sellerId === requesterId ||
      listing.transactions?.some?.(t => t.buyerId === requesterId)

    const { serialNumber, ...publicListing } = listing
    const payload = isBuyerOrSeller ? listing : publicListing

    return res.json({ success: true, listing: payload })
  } catch (err) {
    logger.error('getListing error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── UPDATE LISTING ──────────────────────────────
const updateListing = async (req, res) => {
  try {
    const { id }     = req.params
    const sellerId   = req.user.userId

    const listing = await prisma.secondHandListing.findUnique({
      where:  { id },
      select: { sellerId: true, status: true }
    })
    if (!listing)                       return safeError(res, 404, 'Listing not found')
    if (listing.sellerId !== sellerId)  return safeError(res, 403, 'Not authorized')
    if (listing.status !== 'active')    return safeError(res, 400, 'Cannot edit a locked or sold listing')

    const parsed = createListingSchema.partial().safeParse(req.body)
    if (!parsed.success) return safeError(res, 400, parsed.error.errors[0].message)

    const updated = await prisma.secondHandListing.update({
      where: { id },
      data:  parsed.data
    })
    return res.json({ success: true, listing: updated })
  } catch (err) {
    logger.error('updateListing error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── CANCEL LISTING ──────────────────────────────
const cancelListing = async (req, res) => {
  try {
    const { id }   = req.params
    const sellerId = req.user.userId

    const listing = await prisma.secondHandListing.findUnique({
      where:  { id },
      select: { sellerId: true, status: true }
    })
    if (!listing)                      return safeError(res, 404, 'Listing not found')
    if (listing.sellerId !== sellerId) return safeError(res, 403, 'Not authorized')
    if (listing.status === 'locked')   return safeError(res, 400, 'Cannot cancel listing with active escrow')
    if (listing.status === 'sold')     return safeError(res, 400, 'Listing already sold')

    await prisma.secondHandListing.update({
      where: { id },
      data:  { status: 'cancelled' }
    })
    return res.json({ success: true, message: 'Listing cancelled' })
  } catch (err) {
    logger.error('cancelListing error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── BUY LISTING ─────────────────────────────────
// Race condition protected via Serializable transaction + optimistic lock
const buyListing = async (req, res) => {
  try {
    const { id } = req.params
    const parsed = buyListingSchema.safeParse(req.body)
    if (!parsed.success) return safeError(res, 400, parsed.error.errors[0].message)

    const { inspectionHours, clientRef } = parsed.data
    const buyerId = req.user.userId

    // ── Idempotency check ────────────────────────
    if (clientRef) {
      const existing = await prisma.transaction.findFirst({
        where:  { idempotencyKey: clientRef },
        select: { id: true, referenceNo: true, mpesaCheckoutId: true }
      })
      if (existing) {
        return res.json({
          success: true,
          transactionId:     existing.id,
          referenceNo:       existing.referenceNo,
          checkoutRequestId: existing.mpesaCheckoutId,
          deduplicated:      true,
          message:           'Transaction already initiated.'
        })
      }
    }

    // ── Buyer checks ─────────────────────────────
    const buyer = await prisma.user.findUnique({
      where:  { id: buyerId },
      select: { phone: true, accountStatus: true }
    })
    if (!buyer)                            return safeError(res, 404, 'User not found')
    if (buyer.accountStatus !== 'active')  return safeError(res, 403, 'Account is not active')

    // ── Atomic lock — prevents two buyers racing ─
    let listing, transaction

    try {
      await prisma.$transaction(async (db) => {
        listing = await db.secondHandListing.findUnique({
          where:  { id },
          select: { id: true, sellerId: true, price: true, status: true, title: true }
        })
        if (!listing)                    throw new Error('LISTING_NOT_FOUND')
        if (listing.status !== 'active') throw new Error('LISTING_UNAVAILABLE')
        if (listing.sellerId === buyerId) throw new Error('CANNOT_BUY_OWN')

        const seller = await db.user.findUnique({
          where:  { id: listing.sellerId },
          select: { phone: true, accountStatus: true }
        })
        if (!seller || seller.accountStatus !== 'active') throw new Error('SELLER_UNAVAILABLE')
        if (normalizePhone(buyer.phone) === normalizePhone(seller.phone)) throw new Error('CANNOT_BUY_OWN')

        const amount         = new Decimal(listing.price)
        const fees           = calcFeesSecondHand(amount)
        const platformFee    = fees.platformFee
        const buyerPays      = fees.buyerTotal
        const sellerReceives = fees.sellerReceives.toFixed(2)
        const referenceNo    = generateRef()
        const idempotencyKey = clientRef || crypto.randomUUID()

        transaction = await db.transaction.create({
          data: {
            referenceNo, idempotencyKey,
            buyerId,
            sellerId:        listing.sellerId,
            listingId:       listing.id,
            amount:          buyerPays.toFixed(2),
            platformFee:     platformFee.toFixed(2),
            sellerReceives,
            category:        'second_hand',
            description:     listing.title,
            state:           'initiated',
            buyerPhone:      buyer.phone,
            inspectionHours,
            paymentDeadline:    new Date(Date.now() + PAYMENT_EXPIRY_DELAY),
            inspectionDeadline: new Date(Date.now() + PAYMENT_EXPIRY_DELAY + ((inspectionHours || 24) * 60 * 60 * 1000)),
          }
        })

        // Optimistic lock — fails with P2025 if another buyer already locked it
        await db.secondHandListing.update({
          where: { id, status: 'active' },
          data:  { status: 'locked', lockedAt: new Date() }
        })
      }, { isolationLevel: 'Serializable', timeout: 10000 })

    } catch (txErr) {
      if (txErr.message === 'LISTING_NOT_FOUND')   return safeError(res, 404, 'Listing not found')
      if (txErr.message === 'LISTING_UNAVAILABLE') return safeError(res, 409, 'Listing is no longer available')
      if (txErr.message === 'CANNOT_BUY_OWN')      return safeError(res, 400, 'Cannot buy your own listing')
      if (txErr.message === 'SELLER_UNAVAILABLE')  return safeError(res, 400, 'Seller account is unavailable')
      if (txErr.code === 'P2025')                  return safeError(res, 409, 'Listing was just taken — try another')
      if (txErr.code === 'P2034')                  return safeError(res, 409, 'Conflict — please try again')
      throw txErr
    }

    // ── STK push (outside tx — network call) ─────
    try {
      const amount     = new Decimal(listing.price)
      const buyerPays  = calcFeesSecondHand(amount).buyerTotal
      const stkAmount  = buyerPays.toNearest(1, Decimal.ROUND_HALF_UP).toNumber()

      const stkShortcode = process.env.MPESA_STK_SHORTCODE || process.env.MPESA_SHORTCODE
      const timestamp    = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
      const password     = Buffer.from(`${stkShortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64')
      const token        = await getToken()

      const mpesaRes = await axios.post(
        `${baseURL}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: stkShortcode,
          Password: password, Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount:      stkAmount,
          PartyA:      normalizePhone(buyer.phone),
          PartyB:      stkShortcode,
          PhoneNumber: normalizePhone(buyer.phone),
          CallBackURL: process.env.MPESA_CALLBACK_URL,
          AccountReference: `LS-${transaction.referenceNo}`,
          TransactionDesc: `2ndHand-${listing.title.slice(0, 25)}`
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      )

      if (mpesaRes.data.ResponseCode !== '0') {
        // STK failed — undo the lock
        await prisma.$transaction([
          prisma.transaction.update({ where: { id: transaction.id }, data: { state: 'cancelled' } }),
          prisma.secondHandListing.update({ where: { id: listing.id }, data: { status: 'active', lockedAt: null } })
        ])
        return safeError(res, 400, 'Payment initiation failed. Please try again.')
      }

      const { CheckoutRequestID, MerchantRequestID } = mpesaRes.data

      await prisma.mpesaTransaction.create({
        data: {
          userId:            buyerId,
          checkoutRequestId: CheckoutRequestID,
          merchantRequestId: MerchantRequestID,
          amount:            buyerPays.toFixed(2),
          fee:               calcFeesSecondHand(amount).totalFee.toFixed(2),
          phone:             buyer.phone,
          status:            'pending',
          idempotencyKey:    crypto.randomUUID()
        }
      })

      await prisma.transaction.update({
        where: { id: transaction.id },
        data:  { state: 'payment_pending', mpesaCheckoutId: CheckoutRequestID }
      })

      await scheduleTimer(timerQueue, transaction.id, 'payment_expiry', PAYMENT_EXPIRY_DELAY)

      logger.info('Second hand buy initiated', {
        transactionId: transaction.id, listingId: listing.id,
        buyerId, sellerId: listing.sellerId, inspectionHours
      })
      const { createAndSend: _n1 } = require('../services/notificationService')
      _n1({ userId: listing.sellerId, type: 'payment_received', messageEn: `A buyer paid for your item: ${listing.title}. Funds held in escrow — deliver to release payment.`, transactionId: transaction.id }).catch(() => {})

      return res.json({
        success:           true,
        transactionId:     transaction.id,
        referenceNo:       transaction.referenceNo,
        checkoutRequestId: CheckoutRequestID,
        message:           'Enter M-Pesa PIN to complete payment.'
      })

    } catch (stkErr) {
      console.error(safeError)
      // Network failure — undo lock
      await prisma.$transaction([
        prisma.transaction.update({ where: { id: transaction.id }, data: { state: 'cancelled' } }),
        prisma.secondHandListing.update({ where: { id: listing.id }, data: { status: 'active', lockedAt: null } })
      ])
      logger.error('STK push failed in buyListing', { err: stkErr.message })
      return safeError(res, 500, 'Payment service unavailable. Please try again.')
    }

  } catch (err) {
    logger.error('buyListing error', { err: err.message, stack: err.stack })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── SELLER: MARK HANDOVER ───────────────────────
// Seller physically hands item over → OTP generated → buyer confirms receipt
const sellerHandover = async (req, res) => {
  try {
    const { id }   = req.params
    const sellerId = req.user.userId
    const parsed   = handoverSchema.safeParse(req.body)
    if (!parsed.success) return safeError(res, 400, parsed.error.errors[0].message)

    const tx = await prisma.transaction.findFirst({
      where:   { id, sellerId, category: 'second_hand' },
      include: { buyer: { select: { phone: true } } }
    })
    if (!tx)                 return safeError(res, 404, 'Transaction not found')
    if (tx.state !== 'held') return safeError(res, 400, `Cannot mark handover — state is ${tx.state}`)

    // Guard: seller can only mark delivered within their 30-min window
    // Window opens at inspectionDeadline, closes at inspectionDeadline + 30min
    const SELLER_WINDOW_MS = 30 * 60 * 1000
    if (tx.inspectionDeadline) {
      const windowOpen  = new Date(tx.inspectionDeadline)
      const windowClose = new Date(windowOpen.getTime() + SELLER_WINDOW_MS)
      const now         = new Date()
      if (now < windowOpen) {
        const minsLeft = Math.ceil((windowOpen - now) / 60000)
        return safeError(res, 400, `Too early — your delivery window opens in ${minsLeft} minute(s). Countdown is still running.`)
      }
      if (now > windowClose) {
        return safeError(res, 400, 'Delivery window has expired. Buyer has been refunded automatically.')
      }
    }

    const otp         = generateOtp()
    const otpExpiresAt = new Date(Date.now() + OTP_WINDOW)

    await prisma.transaction.update({
      where: { id },
      data: {
        state:            'delivered',
        deliveredAt:      new Date(),
        otpCode:          otp,
        otpExpiresAt,
        otpVerifiedAt:    null,
        deliveryNotes:    parsed.data.notes || null,
        deliveryProofUrl: parsed.data.conditionPhotos?.length
          ? JSON.stringify(parsed.data.conditionPhotos)
          : null,
        smsDeliveryStatus: 'pending'
      }
    })

    await prisma.auditLog.create({
      data: {
        actorId: sellerId, actorType: 'user', action: 'seller_marked_handover',
        entityType: 'Transaction', entityId: id,
        newState: { state: 'delivered' }, transactionId: id
      }
    })

    await cancelTimer(timerQueue, id, 'handover_timeout')

    // OTP SMS → buyer
    await smsQueue.add('secondhand_otp', {
      type:          'bundle_otp',
      phone:         tx.buyer.phone,
      transactionId: id,
      referenceNo:   tx.referenceNo,
      otp
    })

    const OTP_ENTRY_TIMEOUT = 2 * 60 * 60 * 1000
    await scheduleTimer(timerQueue, id, 'otp_entry_timeout', OTP_ENTRY_TIMEOUT)

    // Push notification → buyer (non-blocking — failure must never block handover)
    try {
      const { createAndSend } = require('../services/notificationService')
      await createAndSend({
        userId:        tx.buyerId,
        type:          'otp_handover',
        messageEn:     `Handover in progress. Your OTP is ${otp} — enter it to confirm you have received the item. This will release funds to the seller.`,
        transactionId: id,
      })
    } catch (notifErr) {
      logger.warn('sellerHandover: push notification failed — handover already confirmed', { transactionId: id, err: notifErr.message })
    }

    return res.json({ success: true, message: 'Handover confirmed. OTP sent to buyer.' })
  } catch (err) {
    logger.error('sellerHandover error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── BUYER: VERIFY HANDOVER OTP ──────────────────
// Buyer enters OTP at meetup → inspection window starts (NOT immediate release)
const verifyHandoverOtp = async (req, res) => {
  try {
    const { id }  = req.params
    const buyerId = req.user.userId
    const { otp } = req.body

    if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
      return safeError(res, 400, 'Invalid OTP format')
    }

    const tx = await prisma.transaction.findFirst({
      where: { id, buyerId, category: 'second_hand' },
      select: {
        id: true, state: true, otpCode: true, otpExpiresAt: true,
        otpVerifiedAt: true, inspectionHours: true, referenceNo: true
      }
    })
    if (!tx)                        return safeError(res, 404, 'Transaction not found')
    if (tx.state !== 'delivered')   return safeError(res, 400, 'OTP not expected at this stage')
    if (tx.otpVerifiedAt)           return safeError(res, 400, 'OTP already used')
    if (new Date() > tx.otpExpiresAt) return safeError(res, 400, 'OTP expired — ask seller to re-initiate handover')
    if (otp.trim() !== tx.otpCode)  return safeError(res, 401, 'Invalid OTP')

    const inspectionMs       = (tx.inspectionHours || 24) * 60 * 60 * 1000
    const inspectionDeadline = new Date(Date.now() + inspectionMs)

    const otpUpdate = await prisma.transaction.updateMany({
      where: { id, state: 'delivered' },
      data: {
        otpVerifiedAt:        new Date(),
        state:                'confirmed',
        confirmationDeadline: inspectionDeadline,
        inspectionDeadline,                        
        autoReleaseAt:        inspectionDeadline,
        otpCode:              null,   
        otpExpiresAt:         null,
      }
    })
    if (otpUpdate.count === 0) {
      return safeError(res, 409, 'OTP entry window expired — funds have been auto-released to the seller')
    }

    await prisma.auditLog.create({
      data: {
        actorId: buyerId, actorType: 'user', action: 'handover_otp_verified',
        entityType: 'Transaction', entityId: id,
        newState: { state: 'confirmed', inspectionStarted: true },
        transactionId: id
      }
    })

    await cancelTimer(timerQueue, id, 'otp_entry_timeout')

    // Dispute window already happened pre-handover (state: held).
    // OTP entry is the buyer's final confirmation — release immediately, no new countdown.
    await releaseToSeller(id, 'otp_confirmed')
    const { createAndSend: _n3 } = require('../services/notificationService')
    _n3({ userId: tx.sellerId, type: 'money_released', messageEn: `Buyer confirmed receipt. Funds are being released to your M-Pesa.`, transactionId: id }).catch(() => {})

    return res.json({
      success: true,
      message: 'Item receipt confirmed. Funds have been released to the seller.'
    })
  } catch (err) {
    logger.error('verifyHandoverOtp error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── BUYER: ACCEPT ITEM EARLY ────────────────────
// Buyer satisfied — releases funds before inspection window ends
const acceptItem = async (req, res) => {
  try {
    const { id }  = req.params
    const buyerId = req.user.userId

    const tx = await prisma.transaction.findFirst({
      where: { id, buyerId, category: 'second_hand' },
      include: {
        disputes: {
          where:  { status: { in: ['open', 'escalated'] } },
          select: { id: true }
        }
      }
    })
    if (!tx)                      return safeError(res, 404, 'Transaction not found')
    if (tx.state !== 'confirmed') return safeError(res, 400, `Cannot accept — state is ${tx.state}`)
    if (tx.disputes.length > 0)   return safeError(res, 409, 'Cannot accept — a dispute is already open on this transaction')

    await cancelTimer(timerQueue, id, 'auto_release')
    await releaseToSeller(id)
    const { createAndSend: _n4 } = require('../services/notificationService')
    _n4({ userId: tx.sellerId, type: 'money_released', messageEn: `Buyer accepted the item early. Funds are being released to your M-Pesa.`, transactionId: id }).catch(() => {})

    return res.json({ success: true, message: 'Item accepted. Funds released to seller.' })
  } catch (err) {
    logger.error('acceptItem error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── BUYER: OPEN DISPUTE ─────────────────────────
const openSecondHandDispute = async (req, res) => {
  try {
    const { id }  = req.params
    const buyerId = req.user.userId
    const parsed  = disputeSchema.safeParse(req.body)
    if (!parsed.success) return safeError(res, 400, parsed.error.message)


    const tx = await prisma.transaction.findFirst({
  where: {
    id,
    buyerId,
    category: 'second_hand',
    state: 'held'
  }
})


    if (!tx) return safeError(res, 404, 'Transaction not found or not disputable')

    //  block duplicate disputes
    const existingDispute = await prisma.dispute.findFirst({ where: { transactionId: id } })
    if (existingDispute) return safeError(res, 409, 'A dispute is already open for this transaction')

    // Block dispute after inspection window expires
    if (tx.confirmationDeadline && new Date() > new Date(tx.confirmationDeadline)) {
      return safeError(res, 400, 'Inspection window has expired. Funds have been auto-released.')
    }

    await prisma.$transaction(async (db) => {
      await db.transaction.update({ where: { id }, data: { state: 'disputed' } })
      await db.dispute.create({
        data: {
          transactionId:    id,
          openedBy:         buyerId,
          reason:           parsed.data.reason,
          description:      parsed.data.description,
          buyerEvidence:    req.files?.length ? { urls: req.files.map(f => f.path) } : null,
          status:           'open',
          responseDeadline: new Date(Date.now() + SELLER_RESPONSE_WINDOW)
        }
      })
      await db.auditLog.create({
        data: {
          actorId: buyerId, actorType: 'user', action: 'second_hand_dispute_opened',
          entityType: 'Transaction', entityId: id,
          newState: { state: 'disputed', reason: parsed.data.reason },
          transactionId: id
        }
      })
    })

    await cancelTimer(timerQueue, id, 'auto_release')
    await cancelTimer(timerQueue, id, 'buyer_decision_deadline')
    const { createAndSend: _n } = require('../services/notificationService')
    _n({ userId: tx.sellerId, type: 'dispute_opened', transactionId: id, messageEn: `Buyer opened a dispute: ${parsed.data.reason}. Respond within 1 hour.` }).catch(() => {})
    await scheduleTimer(timerQueue, id, 'dispute_seller_timeout', SELLER_RESPONSE_WINDOW)

    return res.json({
      success: true,
      message: 'Dispute opened. Seller has 4 hours to respond.'
    })
  } catch (err) {
    logger.error('openSecondHandDispute error', { err: err.message, stack: err.stack })
    console.error('DISPUTE_ERR:', err)
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── SELLER: RESPOND TO DISPUTE ──────────────────
const sellerRespondToDispute = async (req, res) => {
  try {
    const { id }   = req.params 
    const sellerId = req.user.userId
    const parsed   = disputeResponseSchema.safeParse(req.body)
    if (!parsed.success) return safeError(res, 400, parsed.error.errors[0].message)

    const dispute = await prisma.dispute.findUnique({
      where:   { id },
      include: { transaction: { select: { id: true, sellerId: true, state: true, category: true, buyerId: true } } }
    })
    if (!dispute)                                           return safeError(res, 404, 'Dispute not found')
    if (dispute.transaction.sellerId !== sellerId)          return safeError(res, 403, 'Not authorized')
    if (dispute.transaction.category !== 'second_hand')     return safeError(res, 400, 'Not a second hand dispute')
    if (dispute.status !== 'open')                          return safeError(res, 400, 'Dispute already resolved')
    if (dispute.responseDeadline && new Date() > new Date(dispute.responseDeadline)) {
      return safeError(res, 400, 'Response window has expired')
    }

    const evidencePayload = req.files?.length
      ? { urls: req.files.map(f => f.path), notes: parsed.data.sellerNote }
      : null

    if (parsed.data.accepts) {
      // Seller accepts → refund buyer
      await prisma.dispute.update({
        where: { id },
        data: {
          sellerEvidence:   evidencePayload,
          status:           'resolved_buyer',
          resolutionAction: 'full_refund',
          resolutionNote:   'Seller accepted dispute',
          resolvedAt:       new Date()
        }
      })
      await cancelTimer(timerQueue, dispute.transaction.id, 'dispute_seller_timeout')
      await prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          actorId: sellerId, actorType: 'user', action: 'seller_accepted_second_hand_dispute',
          entityType: 'Dispute', entityId: id,
          newState: { status: 'resolved_buyer', resolutionAction: 'full_refund' },
          transactionId: dispute.transaction.id
        }
      })
      await refundBuyer(dispute.transaction.id)
      const { createAndSend: _notify } = require('../services/notificationService')
      _notify({ userId: dispute.transaction.buyerId || dispute.openedBy, type: 'dispute_resolved', transactionId: dispute.transaction.id, messageEn: 'Seller accepted your dispute. Refund is being processed.' }).catch(() => {})
    } else {
      // Seller rejects + submits counter-evidence → escalate to admin
      await prisma.dispute.update({
        where: { id },
        data: {
          sellerEvidence: evidencePayload,
          status:         'escalated',
          resolutionNote: 'Seller rejected dispute — escalated for review',
        }
      })
      await cancelTimer(timerQueue, dispute.transaction.id, 'dispute_seller_timeout')
      await scheduleTimer(timerQueue, dispute.transaction.id, 'dispute_admin_timeout', 24 * 60 * 60 * 1000)
      await prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          actorId: sellerId, actorType: 'user', action: 'seller_rejected_second_hand_dispute',
          entityType: 'Dispute', entityId: id,
          newState: { status: 'escalated' }, transactionId: dispute.transaction.id
        }
      })
    }

    return res.json({
      success: true,
      message: parsed.data.accepts
        ? 'Dispute accepted. Buyer will be refunded.'
        : 'Response submitted. Admin will review evidence.'
    })
  } catch (err) {
    logger.error('sellerRespondToDispute error', { error: err.message, stack: err.stack })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── MY LISTINGS ─────────────────────────────────
const getMyListings = async (req, res) => {
  try {
    const sellerId = req.user.userId
    const { status, page = '1', limit = '20' } = req.query
    const pageNum  = Math.max(1, parseInt(page))
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)))
    const skip     = (pageNum - 1) * limitNum

    const VALID_STATUSES = ['active', 'locked', 'sold', 'cancelled']
    const where = {
      sellerId,
      ...(status && VALID_STATUSES.includes(status) ? { status } : {})
    }

    const [listings, total] = await Promise.all([
      prisma.secondHandListing.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limitNum
      }),
      prisma.secondHandListing.count({ where })
    ])

    return res.json({
      success: true, listings,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    })
  } catch (err) {
    logger.error('getMyListings error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── MY SECOND HAND TRANSACTIONS ─────────────────
const getMySecondHandTransactions = async (req, res) => {
  try {
    const userId   = req.user.userId
    const { role = 'buyer', page = '1', limit = '20' } = req.query
    const pageNum  = Math.max(1, parseInt(page))
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)))
    const skip     = (pageNum - 1) * limitNum

    const where = {
      category: 'second_hand',
      ...(role === 'seller'
        ? { sellerId: userId, deletedBySeller: false }
        : { buyerId:  userId, deletedByBuyer:  false })
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip, take: limitNum,
        include: {
          listing:  { select: { title: true, condition: true, images: true } },
          buyer:    { select: { fullName: true, phone: true } },
          seller:   { select: { fullName: true, phone: true } },
          disputes: { select: { status: true, reason: true } }
        }
      }),
      prisma.transaction.count({ where })
    ])

    return res.json({
      success: true, transactions,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    })
  } catch (err) {
    logger.error('getMySecondHandTransactions error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}


// ─── DEAL BUY (inline deal — no pre-existing listing) ───────────────────
// Buyer fills all details, creates listing + transaction + STK atomically
const dealBuySchema = z.object({
  itemTitle:       z.string().min(3).max(200).trim(),
  sellerPhone:     z.string().optional(),
  sellerTill:      z.string().optional(),
  notifyPhone:     z.string().optional(),
  method:          z.enum(['pochi', 'till']).default('pochi'),
  amount:          z.number().min(1, 'Minimum amount is KES 1'),
  condition:       z.enum(['new', 'like_new', 'refurbished', 'good', 'fair', 'faulty']),
  inspectionHours: z.number()
    .refine(v => VALID_INSPECTION_HOURS.includes(v), { message: 'inspectionHours must be 12, 24, 48, or 72' })
    .default(24),
  description:     z.string().max(500).trim().optional(),
  clientRef:       z.string().optional(),
  photoUrls:       z.array(z.string().url()).max(3).optional(),
})

const dealBuy = async (req, res) => {
  try {
    const parsed = dealBuySchema.safeParse(req.body)
    if (!parsed.success) {
  return safeError(
    res,
    400,
    parsed.error.issues?.[0]?.message || 'Invalid request data'
  );
}

    const {
      itemTitle, sellerPhone, sellerTill, notifyPhone,
      method, amount, condition, inspectionHours, description, clientRef, photoUrls,
    } = parsed.data
    const buyerId = req.user.userId

    // Validate payment target present
    if (method === 'pochi' && !sellerPhone) return safeError(res, 400, 'sellerPhone required for pochi payment')
    if (method === 'till'  && !sellerTill)  return safeError(res, 400, 'sellerTill required for till payment')

    // Idempotency guard
    if (clientRef) {
      const existing = await prisma.transaction.findFirst({
        where:  { idempotencyKey: clientRef },
        select: { id: true, referenceNo: true, mpesaCheckoutId: true }
      })
      if (existing) return res.json({
        success: true, transactionId: existing.id,
        referenceNo: existing.referenceNo,
        checkoutRequestId: existing.mpesaCheckoutId,
        deduplicated: true, message: 'Transaction already initiated.'
      })
    }

    // Buyer checks
    const buyer = await prisma.user.findUnique({
      where:  { id: buyerId },
      select: { phone: true, accountStatus: true }
    })
    if (!buyer)                           return safeError(res, 404, 'User not found')
    if (buyer.accountStatus !== 'active') return safeError(res, 403, 'Account is not active')

    // Resolve seller by phone
    const targetPhone = method === 'pochi' ? sellerPhone : (notifyPhone || sellerPhone)
    let seller = null
    if (targetPhone) {
      seller = await prisma.user.findFirst({
        where:  { phone: { in: [targetPhone, normalizePhone(targetPhone)] } },
        select: { id: true, phone: true, accountStatus: true }
      })
    }
    if (!seller)                                     return safeError(res, 404, 'Seller is not registered on LipaSafe. Ask them to create an account first.')
    if (seller.accountStatus !== 'active')           return safeError(res, 400, 'Seller account is not active')
    if (seller.id === buyerId)                       return safeError(res, 400, 'Cannot create a deal with yourself')

    const amountDecimal  = new Decimal(amount)
    const fees           = calcFeesSecondHand(amountDecimal)
    const platformFee    = fees.platformFee
    const buyerPays      = fees.buyerTotal
    const sellerReceives = fees.sellerReceives.toFixed(2)
    const referenceNo    = generateRef()
    const idempotencyKey = clientRef || crypto.randomUUID()

    let transaction, listing

    // Atomic: create listing + transaction together
    await prisma.$transaction(async (db) => {
      listing = await db.secondHandListing.create({
        data: {
          title:     itemTitle,
          condition,
          price:     amountDecimal.toFixed(2),
          status:    'locked',
          lockedAt:  new Date(),
          sellerId:  seller.id,
          description: description || itemTitle,
          ...(photoUrls && photoUrls.length > 0 ? { images: photoUrls } : {}),
        }
      })

      transaction = await db.transaction.create({
        data: {
          referenceNo, idempotencyKey,
          buyerId,
          sellerId:        seller.id,
          listingId:       listing.id,
          amount:          buyerPays.toFixed(2),
          platformFee:     platformFee.toFixed(2),
          sellerReceives,
          category:        'second_hand',
          description:     description || itemTitle,
          state:           'initiated',
          buyerPhone:      buyer.phone,
          sellerPhone:     targetPhone || null,
          sellerTill:      method === 'till' ? sellerTill : null,
          inspectionHours,
          paymentDeadline:    new Date(Date.now() + PAYMENT_EXPIRY_DELAY),
          inspectionDeadline: new Date(Date.now() + PAYMENT_EXPIRY_DELAY + ((inspectionHours || 24) * 60 * 60 * 1000)),
        }
      })
    }, { isolationLevel: 'Serializable', timeout: 10000 })

    // STK push to buyer's phone
    try {
      const stkAmount    = buyerPays.toNearest(1, Decimal.ROUND_HALF_UP).toNumber()
      const stkShortcode = process.env.MPESA_STK_SHORTCODE || process.env.MPESA_SHORTCODE
      const timestamp    = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
      const password     = Buffer.from(`${stkShortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64')
      const token        = await getToken()

      const mpesaRes = await axios.post(
        `${baseURL}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: stkShortcode,
          Password: password, Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount:      stkAmount,
          PartyA:      normalizePhone(buyer.phone),
          PartyB:      stkShortcode,
          PhoneNumber: normalizePhone(buyer.phone),
          CallBackURL: process.env.MPESA_CALLBACK_URL,
          AccountReference: `LS-${referenceNo}`,
          TransactionDesc: `Deal-${itemTitle.slice(0, 20)}`
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      )

      if (mpesaRes.data.ResponseCode !== '0') {
        await prisma.$transaction([
          prisma.transaction.update({ where: { id: transaction.id }, data: { state: 'cancelled' } }),
          prisma.secondHandListing.update({ where: { id: listing.id }, data: { status: 'cancelled' } })
        ])
        return safeError(res, 400, 'Payment initiation failed. Please try again.')
      }

      const { CheckoutRequestID, MerchantRequestID } = mpesaRes.data

      await prisma.mpesaTransaction.create({
        data: {
          userId:            buyerId,
          checkoutRequestId: CheckoutRequestID,
          merchantRequestId: MerchantRequestID,
          amount:            buyerPays.toFixed(2),
          fee:               calcFeesSecondHand(amountDecimal).totalFee.toFixed(2),
          phone:             buyer.phone,
          status:            'pending',
          idempotencyKey:    crypto.randomUUID()
        }
      })

      await prisma.transaction.update({
        where: { id: transaction.id },
        data:  { state: 'payment_pending', mpesaCheckoutId: CheckoutRequestID }
      })

      await scheduleTimer(timerQueue, transaction.id, 'payment_expiry', PAYMENT_EXPIRY_DELAY)

      logger.info('Deal buy initiated', {
        transactionId: transaction.id, buyerId, sellerPhone: targetPhone, inspectionHours
      })
      const { createAndSend: _n2 } = require('../services/notificationService')
      _n2({ userId: seller.id, type: 'payment_received', messageEn: `A buyer paid for: ${itemTitle}. Funds held in escrow — deliver to release payment.`, transactionId: transaction.id }).catch(() => {})

      return res.json({
        success: true,
        transactionId:     transaction.id,
        referenceNo:       transaction.referenceNo,
        checkoutRequestId: CheckoutRequestID,
        message:           'Enter M-Pesa PIN to complete payment.'
      })

    } catch (stkErr) {
      await prisma.$transaction([
        prisma.transaction.update({ where: { id: transaction.id }, data: { state: 'cancelled' } }),
        prisma.secondHandListing.update({ where: { id: listing.id }, data: { status: 'cancelled' } })
      ])
      logger.error('STK push failed in dealBuy', { err: stkErr.message })
      return safeError(res, 500, 'Payment service unavailable. Please try again.')
    }

  } catch (err) {
    logger.error('dealBuy error', { err: err.message, stack: err.stack })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── SELLER: PENDING ORDERS ──────────────────────
const getSellerPending = async (req, res) => {
  try {
    const sellerId = req.user.userId
    const orders = await prisma.transaction.findMany({
      where: {
        sellerId,
        category: 'second_hand',
        state:    { in: ['held', 'delivered', 'confirmed', 'disputed'] }
      },
      include: {
        buyer:    { select: { phone: true, fullName: true } },
        listing:  { select: { title: true, condition: true, images: true } },
        disputes: {
          where:   { status: { in: ['open', 'escalated'] } },
          take:    1,
          orderBy: { openedAt: 'desc' },
          select:  { id: true, status: true, reason: true, openedAt: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const total = orders.reduce((sum, o) => sum + parseFloat(o.sellerReceives || o.amount), 0)

    return res.json({ success: true, orders, total: total.toFixed(2) })
  } catch (err) {
    logger.error('getSellerPending error', { err: err.message, stack: err.stack }); console.error('SELLER_PENDING_ERR:', err.message, err.stack)
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── GET SINGLE ORDER (seller or buyer) ──────────
const getOrderById = async (req, res) => {
  try {
    const { id }   = req.params
    const userId   = req.user.userId

    const order = await prisma.transaction.findFirst({
      where: {
        id,
        OR: [{ buyerId: userId }, { sellerId: userId }]
      },
      include: {
        buyer:    { select: { phone: true, fullName: true } },
        seller:   { select: { phone: true, fullName: true } },
        listing:  { select: { title: true, condition: true, images: true } },
        disputes: {
          where:   { status: { in: ['open', 'escalated'] } },
          take:    1,
          orderBy: { openedAt: 'desc' },
          select:  { id: true, status: true, reason: true, openedAt: true }
        }
      }
    })
    if (!order) return safeError(res, 404, 'Order not found')

    return res.json({ success: true, order })
  } catch (err) {
    logger.error('getOrderById error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── RELEASE ORDER (alias → sellerHandover) ──────


// ─── TRANSACTION STATUS (for payment polling) ────
const getTransactionStatus = async (req, res) => {
  try {
    const { id }  = req.params
    const userId  = req.user.userId

    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        OR: [{ buyerId: userId }, { sellerId: userId }]
      },
      select: {
        id: true, state: true, referenceNo: true,
        amount: true, sellerReceives: true,
        inspectionHours: true, inspectionDeadline: true,
        createdAt: true, updatedAt: true,
      }
    })
    if (!transaction) return safeError(res, 404, 'Transaction not found')

    return res.json({ success: true, transaction })
  } catch (err) {
    logger.error('getTransactionStatus error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── UPLOAD LISTING PHOTOS ───────────────────────
const uploadListingPhotosHandler = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return safeError(res, 400, 'No photos uploaded')
    }
    const urls = req.files.map(f => f.path)
    return res.json({ success: true, urls })
  } catch (err) {
    logger.error('uploadListingPhotos error', { err: err.message })
    return safeError(res, 500, 'Photo upload failed')
  }
}

const deleteSecondHandTransaction = async (req, res) => {
  try {
    const { id }  = req.params
    const userId  = req.user.userId
    const tx = await prisma.transaction.findFirst({
      where: { id, category: 'second_hand', OR: [{ buyerId: userId }, { sellerId: userId }] }
    })
    if (!tx) return res.status(404).json({ success: false, message: 'Transaction not found' })
    const isBuyer = tx.buyerId === userId
    await prisma.transaction.update({
      where: { id },
      data: isBuyer ? { deletedByBuyer: true } : { deletedBySeller: true }
    })
    return res.json({ success: true, message: 'Transaction removed from history' })
  } catch (err) {
    logger.error('deleteSecondHandTransaction error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

module.exports = {
  createListing, getListings, getListing, updateListing, cancelListing,
  buyListing, sellerHandover, verifyHandoverOtp, acceptItem,
  openSecondHandDispute, sellerRespondToDispute,
  getMyListings, getMySecondHandTransactions,
  dealBuy, getSellerPending, getOrderById, getTransactionStatus,
  uploadListingPhotosHandler,
  deleteSecondHandTransaction,
}