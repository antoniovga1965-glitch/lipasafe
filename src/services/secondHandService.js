'use strict'
const Decimal    = require('decimal.js')
const prisma     = require('../utils/prisma')
const logger     = require('../utils/logger')
const smsQueue   = require('../queues/smsQueue')
const timerQueue = require('../queues/timerQueue')
const {
  normalizePhone,
  generateOtp,
  PLATFORM_FEE_RATE,
} = require('../utils/helpers')
const { scheduleTimer, cancelTimer } = require('../utils/timerUtils')
const crypto = require('crypto')
const redis  = require('../utils/redis')
const { createAndSend } = require('./notificationService')
const { initiateB2C } = require('../utils/mpesaB2C')
const b2cRetryQueue = require('../queues/b2cRetryQueue')
const { b2bPayout } = require('./bundleService')

// ─── SECOND-HAND: refundBuyer ─────────────────────────────────────────────────

const refundBuyer = async (transactionId) => {
  const lockKey = `lock:sh:refund:${transactionId}`
  const lockVal = crypto.randomUUID()
  const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 180)
  if (!acquired) {
    logger.warn('sh.refundBuyer: lock held', { transactionId }); return
  }
  try {
    const tx = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: { id: true, amount: true, platformFee: true, state: true, buyerId: true,
                referenceNo: true, buyer: { select: { phone: true } } }
    })
    if (!tx) { logger.warn('sh.refundBuyer: tx not found', { transactionId }); return }
    if (tx.state === 'refunded') { logger.info('sh.refundBuyer: already refunded', { transactionId }); return }
    if (!['held', 'confirmed', 'disputed'].includes(tx.state)) {
      logger.warn('sh.refundBuyer: wrong state', { transactionId, state: tx.state }); return
    }
    const { b2cCost } = require('../utils/feeCalculator')
    const platformFee   = new Decimal(tx.platformFee || '0')
    const netOfFee      = new Decimal(tx.amount).minus(platformFee)
    const returnB2cFee  = new Decimal(b2cCost(netOfFee.toNumber()))
    const refundAmount  = netOfFee.minus(returnB2cFee)
    if (refundAmount.lte(0)) throw new Error(`sh.refundBuyer: invalid amount ${refundAmount}`)

    await prisma.$transaction(async (db) => {
      const claim = await db.transaction.updateMany({
        where: { id: transactionId, state: { in: ['held', 'disputed'] } },
        data:  { state: 'refunded', completedAt: new Date() }
      })
      if (claim.count !== 1) throw new Error('ALREADY_PROCESSED')

      await db.wallet.update({
        where: { userId: tx.buyerId },
        data:  {
          escrowBalance:     { decrement: tx.amount },
          availableBalance:  { increment: refundAmount },
          lastUpdated:       new Date()
        }
      })
      // Platform fee is earned revenue even on a refund — route it to the platform wallet
      await pw.credit(db, new Decimal(tx.platformFee || '0').toNumber(), transactionId)

      await db.auditLog.create({ data: {
        id: crypto.randomUUID(),
        actorType: 'system', action: 'sh_buyer_refunded',
        entityType: 'Transaction', entityId: transactionId,
        transactionId, amount: refundAmount.toFixed(2),
        newState: { state: 'refunded', refundAmount: refundAmount.toString() }
      }})
    }, { timeout: 15000 })

    await initiateB2C({
      phone:        tx.buyer.phone,
      amount:       refundAmount.toFixed(2),
      originatorId: `sh_refund_${transactionId}`,
      transactionId,
      remarks:      `LipaSafe refund ${tx.referenceNo}`
    })


    await smsQueue.add('sh_refunded', {
      type: 'second_hand_refunded', phone: tx.buyer.phone,
      amount: refundAmount.toString(), referenceNo: tx.referenceNo
    })
    await createAndSend({ userId: tx.buyerId, type: 'refund_sent', transactionId, messageEn: `Your refund of KES ${refundAmount} is being processed. Ref: ${tx.referenceNo}` }).catch(() => {})
    logger.info('sh.refundBuyer: complete', { transactionId, refundAmount })
  } catch (err) {
    if (err.message === 'ALREADY_PROCESSED') {
      logger.info('sh.refundBuyer: idempotent skip', { transactionId }); return
    }
    logger.error('sh.refundBuyer: failed', { transactionId, err: err.message })
    console.error('SH_REFUND_ERR:', err.message, err.stack)
    throw err
  } finally {
    const lua = `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`
    await redis.eval(lua, 1, lockKey, lockVal)
  }
}

// ─── SECOND-HAND: b2cPayout ──────────────────────────────────────────────────
const b2cPayout = async (transactionId) => {
  const lockKey = `lock:sh:payout:${transactionId}`
  const lockVal = crypto.randomUUID()
  const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 180)
  if (!acquired) {
    logger.warn('sh.b2cPayout: lock held — already processing', { transactionId })
    return
  }
  try {
    const tx = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: { id: true, sellerReceives: true, amount: true, state: true,
                sellerId: true, referenceNo: true, sellerTill: true, seller: { select: { phone: true } } }
    })
    if (!tx) { logger.warn('sh.b2cPayout: tx not found', { transactionId }); return }
    const payoutAmount = new Decimal(tx.sellerReceives || tx.amount)
    if (payoutAmount.lte(0)) throw new Error(`sh.b2cPayout: invalid amount ${payoutAmount}`)

    // Record the payout attempt as pending BEFORE calling Safaricom —
    // this is the row a reconciliation job will scan for if the call fails
    const payoutRecord = await prisma.payout.upsert({
      where:  { transactionId_payoutType: { transactionId, payoutType: 'seller_release' } },
      create: {
        id:                       crypto.randomUUID(),
        transactionId,
        payoutType:               'seller_release',
        amount:                   payoutAmount.toFixed(2),
        phone:                    tx.seller.phone,
        payoutChannel:            tx.sellerTill ? 'b2b' : 'b2c',
        payoutDestination:        tx.sellerTill || tx.seller.phone,
        status:                   'pending',
        originatorConversationId: `sh_seller_${transactionId}`
      },
      update: { status: 'pending' }
    })

    if (tx.sellerTill) {
      // ── Till payout via B2B ──
      try {
        await b2bPayout(tx.sellerTill, payoutAmount.toFixed(2), transactionId)
      } catch (b2bErr) {
        await prisma.payout.update({
          where: { id: payoutRecord.id },
          data:  { status: 'failed', failedAt: new Date(), resultDesc: b2bErr.message?.slice(0, 250) }
        })
        await b2cRetryQueue.add('b2c_retry', { transactionId, type: 'second_hand' })
        logger.error('sh.b2cPayout: B2B call failed, queued retry', { transactionId, err: b2bErr.message })
        throw b2bErr
      }
    } else {
      // ── Phone payout via B2C ──
      let b2cRes
      try {
        b2cRes = await initiateB2C({
          phone:        tx.seller.phone,
          amount:       payoutAmount.toFixed(2),
          originatorId: `sh_seller_${transactionId}`,
          transactionId,
          remarks:      `LipaSafe sale payout ${tx.referenceNo}`
        })
      } catch (b2cErr) {
        await prisma.payout.update({
          where: { id: payoutRecord.id },
          data:  { status: 'failed', failedAt: new Date(), resultDesc: b2cErr.message?.slice(0, 250) }
        })
        await b2cRetryQueue.add('b2c_retry', { transactionId, type: 'second_hand' })
        logger.error('sh.b2cPayout: B2C call failed, marked Payout as failed and queued retry', {
          transactionId, err: b2cErr.message
        })
        throw b2cErr
      }
      // Store OriginatorConversationID for callback matching
      if (b2cRes?.OriginatorConversationID) {
        await redis.set(`originator:${b2cRes.OriginatorConversationID}`, transactionId, 'EX', 86400)
      }
    }

    await prisma.payout.update({
      where: { id: payoutRecord.id },
      data:  { status: 'sent', completedAt: new Date() }
    })

await prisma.auditLog.create({ data: {
  id:            crypto.randomUUID(),
  transactionId,
  actorId:   null,     
  actorType: 'system', 
  action:        'second_hand_b2c_payout_fired',
  entityType:    'Transaction', entityId: transactionId,
  metadata:      { amount: payoutAmount.toFixed(2), ref: tx.referenceNo }
}})

    logger.info('sh.b2cPayout: payout complete', { transactionId, amount: payoutAmount })
  } catch (err) {
    if (err.message === 'ALREADY_PROCESSED') {
      logger.info('sh.b2cPayout: already processed — idempotent skip', { transactionId })
    } else {
      logger.error('sh.b2cPayout: failed', { transactionId, err: err.message })
      throw err
    }
  } finally {
    const cur = await redis.get(lockKey)
    if (cur === lockVal) await redis.del(lockKey)
  }
}
const pw = require('../utils/platformWallet')

// ─── CONSTANTS ────────────────────────────────────
const SELLER_GRACE_MS = 30 * 60 * 1000 

// ─── processSecondHandPayment ─────────────────────
// Entry point: STK push confirmed for a second_hand transaction
const processSecondHandPayment = async (mpesaTx, amount, mpesaRef, bundleTx) => {
  const mpesaTxCheck = await prisma.mpesaTransaction.findUnique({ where: { id: mpesaTx.id } })
  if (!mpesaTxCheck || mpesaTxCheck.status !== 'processing') {
    logger.warn('processSecondHandPayment: mpesaTx not in processing state — skipping', {
      transactionId: bundleTx.id, status: mpesaTxCheck?.status,
    })
    return
  }

  // Idempotency guard — transaction state
  const currentTx = await prisma.transaction.findUnique({ where: { id: bundleTx.id } })
  if (!currentTx || !['initiated', 'payment_pending'].includes(currentTx.state)) {
    logger.warn('processSecondHandPayment: transaction not in payable state — skipping', {
      state: currentTx?.state, transactionId: bundleTx.id,
    })
    return
  }

  // Atomic DB block — Serializable isolation
  await prisma.$transaction(async (db) => {
    await db.wallet.update({
      where: { userId: bundleTx.buyerId },
      data: {
        escrowBalance: { increment: bundleTx.amount },
        totalIn:       { increment: bundleTx.amount },
        lastUpdated:   new Date(),
      },
    })
    await db.mpesaTransaction.update({
      where: { id: mpesaTx.id },
      data: {
        status:     'completed',
        mpesaRef,
        resultDesc: 'Second hand escrow held',
        processedAt: new Date(),
      },
    })
    await db.transaction.update({
      where: { id: bundleTx.id },
      data: { state: 'held', mpesaReceipt: mpesaRef, paymentDeadline: null },
    })
    await db.auditLog.create({
      data: {
        actorId:       bundleTx.buyerId,
        actorType:     'user',
        action:        'second_hand_payment_held',
        entityType:    'Transaction',
        entityId:      bundleTx.id,
        amount:        bundleTx.amount,
        newState:      { state: 'held', mpesaRef },
        transactionId: bundleTx.id,
      },
    })
  }, { isolationLevel: 'Serializable' })

  // Fetch both parties for SMS
  const buyer  = await prisma.user.findUnique({
    where: { id: bundleTx.buyerId },
    select: { phone: true, fullName: true },
  })
  const seller = await prisma.user.findUnique({
    where: { id: bundleTx.sellerId },
    select: { phone: true, fullName: true },
  })

  // SMS seller — arrange meetup
  if (seller?.phone) {
    await smsQueue.add('second_hand_seller_notify', {
      type:            'second_hand_seller_notify',
      phone:           normalizePhone(seller.phone),
      buyerName:       buyer?.fullName || 'Buyer',
      amount:          bundleTx.amount,
      transactionId:   bundleTx.id,
      inspectionHours: bundleTx.inspectionHours || 24,
    })
  }

  // SMS buyer — payment confirmed, await meetup
  if (buyer?.phone) {
    await smsQueue.add('second_hand_buyer_notify', {
      type:          'second_hand_buyer_notify',
      phone:         normalizePhone(buyer.phone),
      sellerName:    seller?.fullName || 'Seller',
      amount:        bundleTx.amount,
      transactionId: bundleTx.id,
    })
  }

  // Fetch fresh tx to get inspectionDeadline set at purchase time
  const freshTx = await prisma.transaction.findUnique({
    where:  { id: bundleTx.id },
    select: { inspectionDeadline: true, inspectionHours: true }
  })

  const inspectionHours  = (freshTx?.inspectionHours && freshTx.inspectionHours > 0)
    ? freshTx.inspectionHours
    : 24
  const inspectionDeadline = (freshTx?.inspectionDeadline && new Date(freshTx.inspectionDeadline) > new Date())
    ? new Date(freshTx.inspectionDeadline)
    : new Date(Date.now() + inspectionHours * 60 * 60 * 1000)

  const msUntilWindowOpen  = Math.max(0, inspectionDeadline.getTime() - Date.now())
  const msUntilWindowClose = msUntilWindowOpen + SELLER_GRACE_MS

  // Timer 1: opens seller delivery window at inspectionDeadline
  //          → sends seller SMS "your 30min window is open"
  await scheduleTimer(timerQueue, bundleTx.id, 'inspection_deadline', msUntilWindowOpen)

  // Timer 2: closes seller window 30min later
  //          → if seller never clicked delivered, refund buyer
  await scheduleTimer(timerQueue, bundleTx.id, 'handover_timeout', msUntilWindowClose)

  // Timer 3: auto-OTP at 15min mark — if seller hasn't clicked delivered yet
  //          → system generates OTP and sends to buyer directly
  const msUntilAutoOtp = msUntilWindowOpen + (SELLER_GRACE_MS / 2)
  await scheduleTimer(timerQueue, bundleTx.id, 'auto_otp', msUntilAutoOtp)

  await createAndSend({ userId: bundleTx.sellerId, type: 'payment_received', transactionId: bundleTx.id, messageEn: `Buyer has paid KES ${bundleTx.amount} for your item. Arrange handover.` }).catch(() => {})
  await createAndSend({ userId: bundleTx.buyerId, type: 'confirm_delivery', transactionId: bundleTx.id, messageEn: `Payment held in escrow. Await seller handover.` }).catch(() => {})
  logger.info('Second hand payment held in escrow', {
    transactionId: bundleTx.id,
    mpesaRef,
    inspectionDeadline,
    sellerWindowClose: new Date(Date.now() + msUntilWindowClose),
  })
}

// ─── handleHandoverTimeout ────────────────────────
// Seller never showed up within 24h — refund buyer, unlock listing
// ─── handleAutoOtp ────────────────────────────────
// 15min into seller window — seller hasn't clicked delivered yet
// System auto-generates OTP and sends to buyer directly
const handleAutoOtp = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      buyer:  { select: { phone: true } },
      seller: { select: { phone: true } },
    },
  })
  if (!tx) { logger.warn('handleAutoOtp: tx not found', { transactionId }); return }

  // If seller already clicked delivered (state moved to 'delivered'), skip — OTP already sent
  if (tx.state !== 'held') {
    logger.info('handleAutoOtp: state is ' + tx.state + ' — seller already acted, skipping', { transactionId })
    return
  }

  // Auto-generate OTP and push to buyer
  const otp          = generateOtp()
  const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15min to enter before auto-release

  await prisma.transaction.update({
    where: { id: transactionId },
    data:  {
      otpCode:      otp,
      otpExpiresAt,
      state:        'delivered', // treat as if seller clicked delivered
    }
  })

  await prisma.auditLog.create({
    data: {
      actorId: 'system', actorType: 'system', action: 'auto_otp_generated',
      entityType: 'Transaction', entityId: transactionId,
      newState: { note: 'Seller did not act — system auto-generated OTP at 15min mark' },
      transactionId,
    }
  })

  // SMS → buyer (primary channel — always delivered)
  if (tx.buyer?.phone) {
    await smsQueue.add('secondhand_otp', {
      type:          'bundle_otp',
      phone:         tx.buyer.phone,
      transactionId,
      referenceNo:   tx.referenceNo,
      otp,
    })
  }

  // Push → buyer (bonus channel — works if app is open)
  try {
    const { createAndSend } = require('./notificationService')
    await createAndSend({
      userId:        tx.buyerId,
      type:          'auto_otp',
      messageEn:     `LipaSafe: Seller window ending soon. Your OTP is ${otp} — enter it to confirm receipt. If you don't act, funds will auto-release to seller in 15 minutes.`,
      transactionId,
    })
  } catch (notifErr) {
    logger.warn('handleAutoOtp: push notification failed', { transactionId, err: notifErr.message })
  }

  // SMS → seller — alert them system acted on their behalf
  if (tx.seller?.phone) {
    await smsQueue.add('send-sms', {
      type:    'raw',
      phone:   normalizePhone(tx.seller.phone),
      message: `LipaSafe: You did not mark handover for Ref ${tx.referenceNo}. System has sent OTP to buyer. Funds will auto-release in 15 minutes if buyer doesn't dispute.`,
    })
  }

  // Schedule otp_entry_timeout — 15min for buyer to enter OTP before funds auto-release to seller
  await scheduleTimer(timerQueue, transactionId, 'otp_entry_timeout', 15 * 60 * 1000)

  logger.warn('handleAutoOtp: auto-generated OTP sent to buyer', { transactionId, otp })
}

const handleHandoverTimeout = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      buyer:   { select: { phone: true, fullName: true } },
      seller:  { select: { phone: true, fullName: true } },
      listing: true,
    },
  })

  if (!tx) {
    logger.warn('handleHandoverTimeout: transaction not found', { transactionId })
    return
  }
  // If seller already clicked delivered, window was used — skip refund
  if (tx.state !== 'held') {
    logger.info('handleHandoverTimeout: state is ' + tx.state + ' — seller delivered in time, skipping refund', { transactionId })
    return
  }

  // Refund buyer via B2C (reuse bundleService)
  await refundBuyer(transactionId)

  // Unlock listing — back to active so another buyer can purchase
  if (tx.listingId) {
    await prisma.secondHandListing.update({
      where: { id: tx.listingId },
      data:  { status: 'active', lockedAt: null },
    })
  }

  // SMS buyer
  if (tx.buyer?.phone) {
    await smsQueue.add('second_hand_handover_timeout_buyer', {
      type:          'second_hand_handover_timeout_buyer',
      phone:         normalizePhone(tx.buyer.phone),
      amount:        tx.amount,
      transactionId,
    })
  }

  // SMS seller
  if (tx.seller?.phone) {
    await smsQueue.add('second_hand_handover_timeout_seller', {
      type:          'second_hand_handover_timeout_seller',
      phone:         normalizePhone(tx.seller.phone),
      transactionId,
    })
  }

  logger.info('Handover timeout: buyer refunded, listing unlocked', { transactionId })
}

// ─── handleInspectionDeadline ─────────────────────
// Buyer inspection window expired without dispute — auto-release to seller
const handleInspectionDeadline = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      seller: { select: { phone: true, fullName: true } },
      buyer:  { select: { phone: true } },
    },
  })

  if (!tx) {
    logger.warn('handleInspectionDeadline: transaction not found', { transactionId })
    return
  }

  // This timer fires when seller window opens (inspectionDeadline reached)
  // Only act if still held — seller hasn't clicked delivered yet
  if (tx.state !== 'held') {
    logger.info('handleInspectionDeadline: state is ' + tx.state + ' — skipping notify', { transactionId })
    return
  }

  // SMS seller — your 30min delivery window is NOW open
  if (tx.seller?.phone) {
    await smsQueue.add('seller_window_open', {
      type:    'raw',
      phone:   normalizePhone(tx.seller.phone),
      message: `LipaSafe: Your delivery window is now open for Ref ${tx.referenceNo}. You have 30 minutes to hand over the item and click Delivered in the app. Miss this window and the buyer will be refunded.`
    })
  }

  // Push notification — buyer: inspection window ended, awaiting handover
  try {
    const { createAndSend } = require('./notificationService')
    await createAndSend({
      userId:        tx.buyerId,
      type:          'inspection_expired',
      messageEn:     `Your inspection window for deal ${tx.referenceNo} has ended. The seller has 30 minutes to hand over the item. You will receive an OTP to confirm receipt. If no handover happens, you will be automatically refunded.`,
      transactionId: tx.id,
    })
  } catch (notifErr) {
    logger.warn('handleInspectionDeadline: buyer push failed', { transactionId, err: notifErr.message })
  }
  logger.info('Inspection deadline reached — seller window open, SMS sent', { transactionId })
}


// ─── releaseToSeller ──────────────────────────────
// Buyer accepted OR inspection window expired — pay seller, mark listing sold
const releaseToSeller = async (transactionId, trigger = 'buyer_accept') => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      seller:  { select: { phone: true, fullName: true } },
      buyer:   { select: { phone: true, fullName: true } },
      listing: true,
    },
  })

  if (!tx || !['held', 'confirmed', 'delivered', 'disputed'].includes(tx.state)) {
    logger.warn('releaseToSeller: invalid state', { transactionId, state: tx?.state })
    return
  }

  // Guard: only admin_decision may release a disputed transaction.
  // All other triggers (timers, buyer accept, OTP) are blocked if an open dispute exists.
  if (trigger !== 'admin_decision') {
    const openDispute = await prisma.dispute.findFirst({
      where:  { transactionId, status: 'open' },
      select: { id: true },
    })
    if (openDispute) {
      logger.warn('releaseToSeller: blocked — open dispute exists', {
        transactionId, trigger, disputeId: openDispute.id
      })
      throw new Error(
        `releaseToSeller: open dispute ${openDispute.id} blocks release for trigger=${trigger}`
      )
    }
  }

  // Read stored values — never recalculate at release time
  const fee    = new Decimal(tx.platformFee   || '0')
  const payout = new Decimal(tx.sellerReceives || '0')

  // Atomic DB update — Serializable isolation
  await prisma.$transaction(async (db) => {
    // State lock FIRST — if concurrent release already happened, throw before touching wallet
  const updated = await db.transaction.updateMany({
  where: { id: transactionId, state: { in: ['held', 'confirmed', 'delivered', 'disputed'] } },
  data:  { state: 'releasing', completedAt: new Date(), payoutInitiatedAt: new Date() },
})

    if (updated.count === 0) {
      throw new Error('releaseToSeller: concurrent release detected, state already changed for ' + transactionId)
    }
    // Deduct from buyer escrow — only reached if state lock succeeded
    await db.wallet.update({
      where: { userId: tx.buyerId },
      data: {
        escrowBalance: { decrement: tx.amount },
        totalOut:      { increment: tx.amount },
        lastUpdated:   new Date(),
      },
    })
    // Mark listing sold
    if (tx.listingId) {
      await db.secondHandListing.update({
        where: { id: tx.listingId },
        data:  { status: 'sold', soldAt: new Date() },
      })
    }
    // Audit log
    await db.auditLog.create({
      data: {
        actorId:       tx.buyerId,
        actorType:     'user',
        action:        `second_hand_${trigger}`,
        entityType:    'Transaction',
        entityId:      transactionId,
        amount:        payout.toString(),
        newState:      { state: 'releasing', trigger },
        transactionId,
      },
    })
    // Credit platform wallet with 2% fee — same pattern as bundleService.releaseFunds
    await pw.credit(db, fee.toNumber(), transactionId)
  }, { isolationLevel: 'Serializable' })

  // Payout in-flight — notifications fire from Safaricom callback once confirmed
  await b2cPayout(transactionId)
  logger.info('Second hand payout in-flight, state=releasing', { transactionId, payout: payout.toString(), trigger })
}

const handleDisputeSellerTimeout = async (transactionId) => {
  const dispute = await prisma.dispute.findFirst({
    where: { transactionId, status: 'open' },
    include: {
      transaction: {
        include: {
          buyer:  { select: { phone: true } },
          seller: { select: { phone: true } },
        }
      }
    }
  })

  if (!dispute) {
    logger.info('handleDisputeSellerTimeout: no open dispute found — already resolved', { transactionId })
    return
  }

  // Atomic claim — prevents double-refund if two workers pick this job
  const claimed = await prisma.dispute.updateMany({
    where: { id: dispute.id, status: 'open' },
    data: {
      status:           'resolved_buyer',
      resolutionAction: 'full_refund',
      resolutionNote:   'Seller did not respond within 4 hours — buyer auto-refunded',
      resolvedAt:       new Date()
    }
  })
  if (claimed.count === 0) {
    logger.info('handleDisputeSellerTimeout: dispute already resolved — idempotent skip', { transactionId })
    return
  }

  await refundBuyer(transactionId)

  if (dispute.transaction.buyer?.phone) {
    await smsQueue.add('dispute_seller_timeout_buyer', {
      type:    'raw',
      phone:   normalizePhone(dispute.transaction.buyer.phone),
      message: `LipaSafe: Seller did not respond to your dispute. You have been fully refunded. Ref: ${transactionId}`
    })
  }

  if (dispute.transaction.seller?.phone) {
    await smsQueue.add('dispute_seller_timeout_seller', {
      type:    'raw',
      phone:   normalizePhone(dispute.transaction.seller.phone),
      message: `LipaSafe: You did not respond to the dispute for Ref: ${transactionId} within 4hrs. Buyer has been refunded.`
    })
  }

  logger.info('Dispute seller timeout — buyer auto-refunded', { transactionId })
}


// ─── handleOtpEntryTimeout ────────────────────────
// Buyer never entered OTP within 2h after seller clicked Release
// Seller did their part — auto-release funds to seller
const handleOtpEntryTimeout = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      buyer:  { select: { phone: true, fullName: true } },
      seller: { select: { phone: true, fullName: true } },
    },
  })

  if (!tx) {
    logger.warn('handleOtpEntryTimeout: transaction not found', { transactionId })
    return
  }
  if (tx.state !== 'delivered') {
    logger.info('handleOtpEntryTimeout: state is ' + tx.state + ' — buyer confirmed OTP in time, skipping', { transactionId })
    return
  }

  await releaseToSeller(transactionId, 'otp_entry_timeout')

  logger.info('OTP entry timeout — funds auto-released to seller', { transactionId })
}

// ─── handleBuyerDecisionDeadline ──────────────────
// Buyer 30min post-OTP decision window expired — auto-release to seller
const handleBuyerDecisionDeadline = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      buyer:  { select: { phone: true, fullName: true } },
      seller: { select: { phone: true, fullName: true } },
    },
  })

  if (!tx) {
    logger.warn('handleBuyerDecisionDeadline: transaction not found', { transactionId })
    return
  }
  if (tx.state !== 'confirmed') {
    logger.info('handleBuyerDecisionDeadline: state is ' + tx.state + ' — already resolved, skipping', { transactionId })
    return
  }

  await releaseToSeller(transactionId, 'buyer_decision_expired')

  logger.info('Buyer decision deadline — funds auto-released to seller', { transactionId })
}

// ─── handleDisputeAdminTimeout ───────────────────
// Admin never resolved escalated dispute within 24h
// Buyer-protective default — refund buyer automatically
const handleDisputeAdminTimeout = async (transactionId) => {
  const dispute = await prisma.dispute.findFirst({
    where: { transactionId, status: 'escalated' },
    include: {
      transaction: {
        include: {
          buyer:  { select: { phone: true } },
          seller: { select: { phone: true } },
        }
      }
    }
  })

  if (!dispute) {
    logger.info('handleDisputeAdminTimeout: no escalated dispute found — already resolved', { transactionId })
    return
  }

  // Atomic claim — prevents double-action if two workers fire
  const claimed = await prisma.dispute.updateMany({
    where: { id: dispute.id, status: 'escalated' },
    data: {
      status:           'resolved_buyer',
      resolutionAction: 'full_refund',
      resolutionNote:   'Admin did not resolve within 24h — buyer auto-refunded by system',
      resolvedAt:       new Date()
    }
  })
  if (claimed.count === 0) {
    logger.info('handleDisputeAdminTimeout: dispute already resolved — idempotent skip', { transactionId })
    return
  }

  await prisma.auditLog.create({
    data: {
      actorId:    'system',
      actorType:  'system',
      action:     'dispute_admin_timeout_auto_refund',
      entityType: 'Dispute',
      entityId:   dispute.id,
      newState:   { status: 'resolved_buyer', trigger: 'admin_timeout' },
      transactionId
    }
  })

  await refundBuyer(transactionId)

  if (dispute.transaction.buyer?.phone) {
    await smsQueue.add('dispute_admin_timeout_buyer', {
      type:    'raw',
      phone:   normalizePhone(dispute.transaction.buyer.phone),
      message: `LipaSafe: Your dispute for Ref ${transactionId} was not resolved in time. You have been fully refunded automatically.`
    })
  }

  if (dispute.transaction.seller?.phone) {
    await smsQueue.add('dispute_admin_timeout_seller', {
      type:    'raw',
      phone:   normalizePhone(dispute.transaction.seller.phone),
      message: `LipaSafe: The dispute for Ref ${transactionId} was auto-resolved after 24h. Buyer has been refunded. Contact support if you have questions.`
    })
  }

  logger.info('Dispute admin timeout — buyer auto-refunded', { transactionId })
}


// ─── PARTIAL REFUND (admin dispute resolution) ───────────────────────────────
// Platform keeps full platformFee. Net = amount - platformFee.
// Buyer gets net/2, seller gets net/2. Two separate M-Pesa B2C calls.
const partialRefund = async (transactionId, adminUserId, note) => {
  const lockKey = `lock:sh:partial:${transactionId}`
  const lockVal = crypto.randomUUID()
  const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 180)
  if (!acquired) {
    logger.warn('partialRefund: lock held', { transactionId }); return
  }
  try {
    const tx = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: {
        id: true, amount: true, platformFee: true, state: true,
        buyerId: true, sellerId: true, referenceNo: true,
        buyer:  { select: { phone: true } },
        seller: { select: { phone: true } }
      }
    })
    if (!tx) throw new Error('partialRefund: tx not found')
    if (!['held', 'disputed'].includes(tx.state)) throw new Error(`partialRefund: wrong state ${tx.state}`)

    const { b2cCost } = require('../utils/feeCalculator')
    const fee      = new Decimal(tx.platformFee || '0')
    const net      = new Decimal(tx.amount).minus(fee)
    if (net.lte(0)) throw new Error(`partialRefund: net amount invalid ${net}`)
    // Two separate B2C payouts (buyer leg + seller leg) — each incurs its own Safaricom charge.
    // Estimate each leg's size first to find the right fee tier, then hold back both charges
    // before splitting evenly, so the platform isn't left covering Safaricom's cut.
    const rawHalf  = net.dividedBy(2)
    const totalB2c = new Decimal(b2cCost(rawHalf.toNumber())).times(2)
    const adjustedNet = net.minus(totalB2c)
    if (adjustedNet.lte(0)) throw new Error(`partialRefund: adjustedNet invalid after b2c deduction ${adjustedNet}`)
    const half    = adjustedNet.dividedBy(2).toDecimalPlaces(2, Decimal.ROUND_DOWN)

    // Atomic DB: mark resolved, update both wallets, audit
    await prisma.$transaction(async (db) => {
      const claim = await db.transaction.updateMany({
        where: { id: transactionId, state: { in: ['held', 'disputed'] } },
        data:  { state: 'resolved', completedAt: new Date() }
      })
      if (claim.count !== 1) throw new Error('ALREADY_PROCESSED')

      // Buyer wallet — return half, deduct from escrow
      await db.wallet.update({
        where: { userId: tx.buyerId },
        data: {
          escrowBalance:    { decrement: tx.amount },         // full original amount leaves escrow
          availableBalance: { increment: half.toFixed(2) },  // buyer gets half
          lastUpdated:      new Date()
        }
      })

      // Seller wallet — credit half
      await db.wallet.upsert({
        where:  { userId: tx.sellerId },
        update: {
          availableBalance: { increment: half.toFixed(2) },
          totalIn:          { increment: half.toFixed(2) },
          lastUpdated:      new Date()
        },
        create: {
          id:               crypto.randomUUID(),
          userId:           tx.sellerId,
          availableBalance: half.toFixed(2),
          escrowBalance:    '0.00',
          pendingBalance:   '0.00',
          totalIn:          half.toFixed(2),
          totalOut:         '0.00',
          lastUpdated:      new Date()
        }
      })

      // Platform fee is earned revenue even on a partial refund — route it to the platform wallet
      await pw.credit(db, fee.toNumber(), transactionId)

      await db.auditLog.create({ data: {
        id:            crypto.randomUUID(),
        actorId:       adminUserId,
        actorType:     'admin',
        action:        'sh_partial_refund',
        entityType:    'Transaction',
        entityId:      transactionId,
        transactionId,
        amount:        tx.amount,
        metadata:      { fee: fee.toFixed(2), net: net.toFixed(2), eachGets: half.toFixed(2), note }
      }})
    }, { timeout: 15000 })

    // Two M-Pesa B2C payouts — buyer first, then seller
    await prisma.payout.upsert({
      where:  { transactionId_payoutType: { transactionId, payoutType: 'partial_buyer' } },
      create: {
        id:                       crypto.randomUUID(),
        transactionId,
        payoutType:               'partial_buyer',
        amount:                   half.toFixed(2),
        phone:                    tx.buyer.phone,
        payoutChannel:            'b2c',
        payoutDestination:        tx.buyer.phone,
        status:                   'pending',
        originatorConversationId: `partial_buyer_${transactionId}`
      },
      update: { status: 'pending' }
    })
    await prisma.payout.upsert({
      where:  { transactionId_payoutType: { transactionId, payoutType: 'partial_seller' } },
      create: {
        id:                       crypto.randomUUID(),
        transactionId,
        payoutType:               'partial_seller',
        amount:                   half.toFixed(2),
        phone:                    tx.seller.phone,
        payoutChannel:            'b2c',
        payoutDestination:        tx.seller.phone,
        status:                   'pending',
        originatorConversationId: `partial_seller_${transactionId}`
      },
      update: { status: 'pending' }
    })

    // Trigger actual M-Pesa calls
    await initiateB2C({ phone: tx.buyer.phone,  amount: half.toFixed(2), originatorId: `partial_buyer_${transactionId}`,  transactionId, remarks: `LipaSafe partial refund buyer ${tx.referenceNo}`  }).catch(e => logger.error('partialRefund: buyer b2c failed',  { e: e.message }))
    await initiateB2C({ phone: tx.seller.phone, amount: half.toFixed(2), originatorId: `partial_seller_${transactionId}`, transactionId, remarks: `LipaSafe partial refund seller ${tx.referenceNo}` }).catch(e => logger.error('partialRefund: seller b2c failed', { e: e.message }))

    logger.info('partialRefund: complete', { transactionId, fee: fee.toFixed(2), eachGets: half.toFixed(2) })
  } catch (err) {
    if (err.message === 'ALREADY_PROCESSED') {
      logger.info('partialRefund: idempotent skip', { transactionId }); return
    }
    logger.error('partialRefund: failed', { transactionId, err: err.message })
    throw err
  } finally {
    const cur = await redis.get(lockKey)
    if (cur === lockVal) await redis.del(lockKey)
  }
}

// ─── handleAutoRelease ───────────────────────────
// Timer fired after full inspectionHours — auto-release to seller
const handleAutoRelease = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:  { id: transactionId },
    select: { id: true, state: true, buyerId: true, referenceNo: true }
  })
  if (!tx) { logger.warn('handleAutoRelease: tx not found', { transactionId }); return }
  if (tx.state !== 'confirmed') {
    logger.info('handleAutoRelease: state is ' + tx.state + ' — already resolved, skipping', { transactionId })
    return
  }
  // Notify buyer before funds leave — non-blocking
  try {
    const { createAndSend } = require('./notificationService')
    await createAndSend({
      userId:        tx.buyerId,
      type:          'auto_release',
      messageEn:     `Your inspection window for deal ${tx.referenceNo} has ended. Funds are being automatically released to the seller. If you have an issue, contact support immediately.`,
      transactionId: tx.id,
    })
  } catch (notifErr) {
    logger.warn('handleAutoRelease: push notification failed — releasing anyway', { transactionId, err: notifErr.message })
  }
  await releaseToSeller(transactionId, 'auto_release')
  logger.info('handleAutoRelease: funds released to seller', { transactionId })
}

module.exports = {
  refundBuyer,
  processSecondHandPayment,
  handleHandoverTimeout,
  handleAutoOtp,
  handleInspectionDeadline,
  handleOtpEntryTimeout,
  handleBuyerDecisionDeadline,
  releaseToSeller,
  partialRefund,
  handleDisputeSellerTimeout,
  handleDisputeAdminTimeout,
  handleAutoRelease,
  b2cPayout,
}
