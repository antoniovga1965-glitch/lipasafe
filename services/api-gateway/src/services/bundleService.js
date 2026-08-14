'use strict'
const Decimal = require('decimal.js')
const axios = require('axios')
const crypto = require('crypto')
const prisma = require('../utils/prisma')
const redis = require('../utils/redis')
const logger = require('../utils/logger')
const { calcFees } = require('../utils/feeCalculator')
const smsQueue = require('../queues/smsQueue')
const timerQueue = require('../queues/timerQueue')
const { getToken, baseURL } = require('../utils/mpesaToken')

// ─── IMPORTED FROM CANONICAL LOCATIONS ─────────────────────────────────────
const {
  PLATFORM_FEE_RATE, PAYMENT_EXPIRY_DELAY, DELIVERY_REMINDER_DELAY,
  SELLER_DELIVERY_DEADLINE, AUTO_RELEASE_DELAY, DISPUTE_DEADLINE_DELAY, OTP_WINDOW,
  generateOtp, generateRef, normalizePhone, fromDecimal
} = require('../utils/helpers')
const { scheduleTimer, cancelTimer } = require('../utils/timerUtils');

const findOrCreateSeller = async (sellerPhone) => {
  let seller = await prisma.user.findUnique({ where: { phone: sellerPhone } })
  
  if (!seller) {
    seller = await prisma.user.create({
      data: {
        phone: sellerPhone,
        fullName: `Ghost_${sellerPhone}`,
        email: `ghost_${sellerPhone}@lipasafe.local`,
        pinHash: "GHOST"
      }
    })
    await prisma.wallet.create({ data: { userId: seller.id } })
  }
  
  return seller
}


// ─── PROCESS ESCROW PAYMENT (called from mpesa callback) ──
const processEscrowPayment = async (mpesaTx, amount, mpesaRef, bundleTx) => {

  const mpesaTxCheck = await prisma.mpesaTransaction.findUnique({ where: { id: mpesaTx.id } })
  if (!mpesaTxCheck || mpesaTxCheck.status !== 'processing') {
    logger.warn('processEscrowPayment: mpesaTx not in processing state — skipping', { transactionId: bundleTx.id, status: mpesaTxCheck?.status })
    return
  }

  const currentTx = await prisma.transaction.findUnique({ where: { id: bundleTx.id } })
  if (!currentTx || !['initiated', 'payment_pending'].includes(currentTx.state)) {
    logger.warn('processEscrowPayment: transaction not in payable state — skipping', { state: currentTx?.state, transactionId: bundleTx.id })
    return
  }

  await prisma.$transaction(async (db) => {
    await db.wallet.update({
      where: { userId: bundleTx.buyerId },
      data: {
        escrowBalance: { increment: bundleTx.amount },
        totalIn:       { increment: bundleTx.amount },
        lastUpdated:   new Date()
      }
    })
    await db.mpesaTransaction.update({
      where: { id: mpesaTx.id },
      data: { status: 'completed', mpesaRef, resultDesc: 'Escrow held', processedAt: new Date() }
    })
    await db.transaction.update({
      where: { id: bundleTx.id },
      data: { state: 'held', mpesaReceipt: mpesaRef, paymentDeadline: null }
    })
    await db.auditLog.create({
      data: {
        id:            crypto.randomUUID(),
        actorId:       bundleTx.buyerId, actorType: 'user',
        action:        'bundle_payment_held',
        entityType:    'Transaction', entityId: bundleTx.id,
        amount:        bundleTx.amount.toFixed(2),
        newState:      { state: 'held', mpesaRef },
        transactionId: bundleTx.id
      }
    })
  })

  // SMS seller — use notifyPhone if set (till method), else seller.phone (pochi)
  const buyer       = await prisma.user.findUnique({ where: { id: bundleTx.buyerId }, select: { phone: true } })
  const notifyPhone = bundleTx.notifyPhone || null
  const isTill      = bundleTx.sellerTill != null

  if (notifyPhone) {
    await smsQueue.add('bundle_seller_notify', {
      type:          isTill ? 'bundle_seller_notify_till' : 'bundle_seller_notify',
      phone:         notifyPhone,
      transactionId: bundleTx.id,
      amount:        bundleTx.amount.toString(),
      buyerPhone:    buyer.phone,
      sellerTill:    bundleTx.sellerTill || null,
      description:   bundleTx.description || 'bundles',
      referenceNo:   bundleTx.referenceNo
    })
  } else {
    logger.warn('processEscrowPayment: no notifyPhone — skipping seller SMS', { transactionId: bundleTx.id })
  }

  // Schedule seller delivery deadline — 30 mins to mark delivered or buyer gets refunded
  await scheduleTimer(timerQueue, bundleTx.id, 'seller_delivery_deadline', SELLER_DELIVERY_DEADLINE)
  await scheduleTimer(timerQueue, bundleTx.id, 'delivery_reminder', DELIVERY_REMINDER_DELAY)
  const { createAndSend: _pushBundle } = require('./notificationService')
  // Notify buyer — payment held
  await _pushBundle({ userId: bundleTx.buyerId, type: 'money_sent', transactionId: bundleTx.id,
    messageEn: `Payment of KES ${bundleTx.amount} held in escrow. Waiting for seller to deliver.` }).catch(() => {})
  // Notify seller if registered
  if (notifyPhone) {
    const _sv = notifyPhone.startsWith('254') ? ['0'+notifyPhone.slice(3), notifyPhone] : [notifyPhone, '254'+notifyPhone.slice(1)]
    const _su = await prisma.user.findFirst({ where: { phone: { in: _sv } }, select: { id: true } })
    if (_su) await _pushBundle({ userId: _su.id, type: 'deliver_now', transactionId: bundleTx.id,
      messageEn: `New order! KES ${bundleTx.amount} held in escrow. Ref: #${bundleTx.referenceNo}. Mark as dispatched in app.` }).catch(() => {})
  }
  logger.info('Bundle payment held in escrow', { transactionId: bundleTx.id, mpesaRef })
}

// ─── B2C PAYOUT ──────────────────────────────────
const b2cPayout = async (phone, amount, transactionId, payoutType = 'full', resultURL, timeoutURL, forceNewId = false) => {
  const idempKey  = `b2c:${transactionId}:${payoutType}`
  const legacyKey = `b2c:${transactionId}`

  // forceNewId = true means: this is a confirmed retry after a real Safaricom
  // failure, not an accidental duplicate. Throw away any cached tracking ID
  // (Redis and DB) and mint a fresh one so the request actually reaches
  // Safaricom instead of bouncing off their own duplicate-detection and
  // getting falsely treated as a success.
  let originatorId = forceNewId ? null : await redis.get(idempKey)

  // Fallback: check legacy key so in-flight txs don't double-pay during deploy
  if (!originatorId && !forceNewId && payoutType === 'full') {
    originatorId = await redis.get(legacyKey)
    if (originatorId) {
      await redis.set(idempKey, originatorId, 'EX', 86400)
      await redis.set(`originator:${originatorId}`, transactionId, 'EX', 86400)
      logger.info('b2cPayout: migrated legacy Redis idempKey', { transactionId, payoutType })
    }
  }
  if (!originatorId) {
    if (!forceNewId) {
      // Check DB first — survives Redis eviction and TTL expiry
      const existingPayout = await prisma.payout.findUnique({
        where:  { transactionId_payoutType: { transactionId, payoutType } },
        select: { originatorConversationId: true }
      })
      if (existingPayout?.originatorConversationId &&
          !existingPayout.originatorConversationId.startsWith('init_') &&
          !existingPayout.originatorConversationId.startsWith('refund_init_')) {
        originatorId = existingPayout.originatorConversationId
        logger.info('b2cPayout: recovered originatorId from DB after Redis miss', { transactionId, originatorId })
      }
    }
    if (!originatorId) {
      originatorId = crypto.randomUUID()
      if (forceNewId) {
        logger.info('b2cPayout: forceNewId — discarded cached tracking ID, minted fresh one for retry', { transactionId, payoutType, originatorId })
      }
    }
    await redis.set(idempKey, originatorId, 'EX', 86400)
    await redis.set(`originator:${originatorId}`, transactionId, 'EX', 86400)
  }

  const token           = await getToken()
  const normalizedPhone = normalizePhone(phone)

  // ── Retry with exponential backoff ──
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(`${baseURL}/mpesa/b2c/v3/paymentrequest`, {
        OriginatorConversationID: originatorId,
        InitiatorName:            process.env.MPESA_B2C_INITIATOR_NAME,
        SecurityCredential:       process.env.MPESA_B2C_SECURITY_CREDENTIAL,
        CommandID:                'BusinessPayment',
        Amount:                   Math.round(amount),
        PartyA:                   process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE,
        PartyB:                   normalizedPhone,
        Remarks:                  `LipaSafe bundle ${transactionId}`,
        QueueTimeOutURL:          timeoutURL || process.env.MPESA_B2C_TIMEOUT_URL,
        ResultURL:                resultURL  || process.env.MPESA_B2C_RESULT_URL
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 })

      if (res.data.ResponseCode !== '0') {
        throw new Error(`B2C failed: ${res.data.ResponseDescription}`)
      }
      logger.info('B2C payout initiated', { phone: normalizedPhone, amount, transactionId, attempt })
      return res.data
    } catch (err) {
      // 500.002.1001 = Duplicate OriginatorConversationID — Safaricom already processed it

      if (err.response?.data?.errorCode === '500.002.1001') {
        logger.warn('B2C duplicate OriginatorConversationID — payment already sent, treating as success', { transactionId, attempt })
        return { ResponseCode: '0', ResponseDescription: 'Duplicate — already processed', OriginatorConversationID: originatorId }
      }
      console.error(err)
      lastErr = err
      if (attempt < 3) {
        const delay = 1000 * Math.pow(2, attempt)
        console.error('B2C RAW ERROR:', err.message, JSON.stringify(err.response?.data || {}))
        logger.warn(`B2C attempt ${attempt} failed — retrying in ${delay}ms`, { err: err.message, response: err.response?.data })
        await sleep(delay)
      }
    }
  }
  throw lastErr
}


// ─── PERMANENT Safaricom error codes — never retry these ─────────────
// Retrying a permanent error wastes API quota and delays alerting the team
const B2B_PERMANENT_ERRORS = new Set([
  'SFC_IC0003',  // Receiver party is invalid 
  'SFC_IC0009',  // Invalid till number
  'SFC_IC0002',  // Initiator credentials invalid
  'SFC_IC0007',  // Invalid amount
])

// ─── B2B PAYOUT (TILL) ───────────────────────────────────────────────
const b2bPayout = async (tillNumber, amount, transactionId) => {
  const prismaLocal = require('../utils/prisma')

  
  const cleanTill = String(tillNumber).trim()
  if (!/^\d{5,8}$/.test(cleanTill)) {
    throw new Error(`B2B: invalid till number "${tillNumber}" — expected 5-8 digits`)
  }

  // ── Idempotency: resolve or generate originatorId ─────────────────
  const idempKey = `b2b:${transactionId}`
  let originatorId = await redis.get(idempKey)

  if (!originatorId) {
    const existingTx = await prismaLocal.transaction.findUnique({
      where:  { id: transactionId },
      select: { b2bOriginatorId: true },
    })

    if (existingTx?.b2bOriginatorId) {
      originatorId = existingTx.b2bOriginatorId
      logger.info('b2bPayout: recovered originatorId from DB', { transactionId, originatorId })
    } else {
      originatorId = crypto.randomUUID()
      await prismaLocal.transaction.update({
        where: { id: transactionId },
        data:  { b2bOriginatorId: originatorId },
      })
    }

    await redis.set(idempKey, originatorId, 'EX', 86400)
    await redis.set(`b2b:reverse:${originatorId}`, transactionId, 'EX', 86400)
  }


  await prismaLocal.payout.updateMany({
    where: { transactionId, payoutType: 'full' },
    data:  { originatorConversationId: originatorId },
  })

  const token = await getToken()
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  let lastErr

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(
        `${baseURL}/mpesa/b2b/v1/paymentrequest`,
        {
          OriginatorConversationID: originatorId,
          Initiator:                process.env.MPESA_B2B_INITIATOR_NAME,
          SecurityCredential:       process.env.MPESA_B2B_SECURITY_CREDENTIAL,
          CommandID:                'BusinessBuyGoods',
          Amount:                   Math.round(amount),
          PartyA:                   process.env.MPESA_B2B_SHORTCODE,
          SenderIdentifierType:     '4',
          PartyB:                   cleanTill,
          RecieverIdentifierType:   '2',  
          AccountReference:         `LipaSafe-${transactionId}`,
          Remarks:                  `LipaSafe bundle ${transactionId}`,
          QueueTimeOutURL:          process.env.MPESA_B2B_TIMEOUT_URL,
          ResultURL:                process.env.MPESA_B2B_RESULT_URL,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
      )
      logger.info('B2B ENV CHECK', {
  initiator: process.env.MPESA_B2B_INITIATOR_NAME,
  shortcode: process.env.MPESA_B2B_SHORTCODE,
  credFirst20: process.env.MPESA_B2B_SECURITY_CREDENTIAL?.substring(0, 20),
  credLength: process.env.MPESA_B2B_SECURITY_CREDENTIAL?.length,
})

      if (res.data.ResponseCode !== '0') {
        throw new Error(`B2B rejected at initiation: ${res.data.ResponseDescription}`)
      }

      //  Store Safaricom's ConversationID as a second reverse key ──
    
      if (res.data.ConversationID) {
        await redis.set(`b2b:reverse:${res.data.ConversationID}`, transactionId, 'EX', 86400)
      }

      logger.info('B2B payout initiated', {
        tillNumber: cleanTill,
        amount,
        transactionId,
        attempt,
        originatorId,
        conversationId: res.data.ConversationID,
      })

      return res.data

    } catch (err) {
      // Duplicate — Safaricom already processed this UUID, treat as success
      if (err.response?.data?.errorCode === '500.002.1001') {
        logger.warn('B2B duplicate OriginatorConversationID — already processed', { transactionId })
        return {
          ResponseCode: '0',
          ResponseDescription: 'Duplicate — already processed',
          OriginatorConversationID: originatorId,
        }
      }

      const resultCode = err.response?.data?.ResultCode ?? err.response?.data?.errorCode
      if (B2B_PERMANENT_ERRORS.has(resultCode)) {
        logger.error('B2B permanent failure — aborting retries', {
          transactionId,
          resultCode,
          reason: err.response?.data?.ResultDesc,
          tillNumber: cleanTill,
        })
        throw err 
      }

      lastErr = err
      const isLastAttempt = attempt >= 3

     
      logger.warn(`B2B attempt ${attempt} failed`, {
        err:       err.message,
        apiError:  err.response?.data,
        willRetry: !isLastAttempt,
      })

      if (!isLastAttempt) {
        await sleep(1000 * Math.pow(2, attempt))
      }
    }
  }

  throw lastErr
}
// ─── RELEASE FUNDS TO SELLER ─────────────────────
const releaseFunds = async (transactionId) => {

  const lockKey  = `lock:release:${transactionId}`
  const lockVal  = crypto.randomUUID()
  const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 180)
  if (!acquired) {
    logger.error('releaseFunds: could not acquire Redis lock — another worker is processing', { transactionId })
    return
  }

  try {
    const tx = await prisma.transaction.findUnique({
      where:   { id: transactionId },
      include: {
        buyer:  { select: { phone: true } },
        seller: { select: { phone: true } }
      }
    })
    if (!tx) {
      logger.error('releaseFunds: transaction not found', { transactionId })
      return
    }
    if (tx.state === 'released' || tx.state === 'payout_pending') {
      logger.info('releaseFunds: already processed — idempotent skip', { transactionId, state: tx.state })
      return
    }
    if (!['confirmed', 'held'].includes(tx.state)) {
      logger.warn('releaseFunds: wrong state, cannot release', { transactionId, state: tx.state })
      return
    }

    const txFull = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: { notifyPhone: true, sellerTill: true }
    })
    tx.notifyPhone = txFull?.notifyPhone || null
    tx.sellerTill  = txFull?.sellerTill  || null

    const sellerReceives = fromDecimal(tx.sellerReceives)
    const platformFee    = fromDecimal(tx.platformFee)

    // ── Atomic: state claim + buyer escrow deduct + audit ──
    await prisma.$transaction(async (db) => {
      const claim = await db.transaction.updateMany({
        where: { id: transactionId, state: { in: ['confirmed', 'held'] } },
        data:  { state: 'payout_pending', payoutInitiatedAt: new Date() }
      })
      if (claim.count !== 1) throw new Error('ALREADY_PROCESSED')
      await db.payout.upsert({
        where:  { transactionId_payoutType: { transactionId, payoutType: 'full' } },
        create: {
          transactionId,
          payoutType:        'full',
          amount:            tx.sellerReceives,
          phone:             tx.notifyPhone || tx.seller.phone || tx.sellerTill || 'unknown',
          payoutChannel:     tx.sellerTill ? 'b2b' : 'b2c',
          payoutDestination: tx.sellerTill || tx.notifyPhone || tx.seller.phone,
          status:            'pending',
          originatorConversationId: `init_${transactionId}`
        },
        update: { status: 'pending', initiatedAt: new Date() }
      })
      const wallet = await db.wallet.findUnique({
        where:  { userId: tx.buyerId },
        select: { escrowBalance: true }
      })
      if (!wallet) throw new Error(`releaseFunds: wallet not found for buyer ${tx.buyerId}`)
      if (new Decimal(wallet.escrowBalance).lt(new Decimal(tx.amount))) {
        logger.error('releaseFunds: escrowBalance insufficient', {
          transactionId, escrowBalance: wallet.escrowBalance.toString(), required: tx.amount.toString()
        })
        throw new Error(`releaseFunds: insufficient escrow balance`)
      }
      await db.wallet.update({
        where: { userId: tx.buyerId },
        data: {
          escrowBalance: { decrement: tx.amount },
          totalOut:      { increment: tx.amount },
          lastUpdated:   new Date()
        }
      })
      await db.auditLog.create({
        data: {
          id:          crypto.randomUUID(),
          actorType:   'system', action: 'payout_intent_recorded',
          entityType:  'Transaction', entityId: transactionId,
          amount:      tx.amount.toFixed(2),
          newState:    { state: 'payout_pending' },
          transactionId
        }
      })
    }, { timeout: 15000 })

    // ── Call Safaricom ──
    let payoutOriginatorId
    try {
      if (tx.sellerTill) {
        const b2bRes = await b2bPayout(tx.sellerTill, sellerReceives.toNumber(), transactionId)
        payoutOriginatorId = b2bRes?.OriginatorConversationID
      } else {
        const payoutPhone = tx.notifyPhone || tx.seller.phone
        const b2cRes      = await b2cPayout(payoutPhone, sellerReceives.toNumber(), transactionId)
        payoutOriginatorId = b2cRes?.OriginatorConversationID
      }
    } catch (payoutErr) {
      logger.error('releaseFunds: Safaricom payout failed after retries', {
        transactionId, error: payoutErr.message
      })
      await prisma.payout.updateMany({
        where: { transactionId, payoutType: 'full' },
        data:  { status: 'failed' }
      })
      await prisma.auditLog.create({
        data: {
          id:          crypto.randomUUID(),
          actorType:   'system', action: 'payout_failed',
          entityType:  'Transaction', entityId: transactionId,
          amount:      tx.amount.toFixed(2),
          newState:    { state: 'payout_pending', payoutStatus: 'failed', error: payoutErr.message },
          transactionId
        }
      })
      throw payoutErr
    }

    // Update payout record with real originator ID
    if (payoutOriginatorId) {
      await prisma.payout.updateMany({
        where: { transactionId, payoutType: 'full' },
        data:  { status: 'sent', originatorConversationId: payoutOriginatorId }
      })
    }

    // ── STOP HERE — let callback confirm success before marking released ──
    logger.info('releaseFunds: payout sent to Safaricom, awaiting callback', { 
      transactionId, 
      payoutOriginatorId,
      sellerReceives: sellerReceives.toFixed(2) 
    })

  } finally {
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end`
    await redis.eval(luaScript, 1, lockKey, lockVal)
  }
}

// ─── REFUND BUYER ────────────────────────────────
const refundBuyer = async (transactionId) => {
  const lockKey  = `lock:refund:${transactionId}`
  const lockVal  = crypto.randomUUID()
  const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 180)
  if (!acquired) {
    logger.error('refundBuyer: could not acquire lock — already processing', { transactionId })
    return
  }
  try {
    const tx = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: { id: true, amount: true, sellerReceives: true, platformFee: true, state: true, buyerId: true, referenceNo: true, buyer: { select: { phone: true } } }
    })

    if (!tx) {
      logger.warn('refundBuyer: transaction not found', { transactionId })
      return
    }
    if (tx.state === 'refunded') {
      logger.info('refundBuyer: already refunded — idempotent skip', { transactionId })
      return
    }
    if (!['held', 'disputed'].includes(tx.state)) {
      logger.warn('refundBuyer: wrong state, cannot refund', { transactionId, state: tx.state })
      return
    }

    // Refund = gross amount minus platform fee (2%) and B2C return cost
    // Platform fee is non-refundable — covers escrow service regardless of outcome
    // B2C cost is non-refundable — Safaricom charges to send money back
    const { calcFees, b2cCost } = require('../utils/feeCalculator')
    const gross        = new Decimal(tx.amount)
    const platformFee  = new Decimal(tx.platformFee)
    const returnB2cFee = new Decimal(b2cCost(gross.minus(platformFee).toNumber()))
    const refundAmount = gross.minus(platformFee).minus(returnB2cFee)
    if (!refundAmount || refundAmount.lte(0)) {
      throw new Error(`refundBuyer: invalid refundAmount ${refundAmount} for tx ${transactionId}`)
    }
    logger.info('refundBuyer: fee breakdown', {
      transactionId,
      gross:         gross.toFixed(2),
      platformFee:   platformFee.toFixed(2),
      returnB2cFee:  returnB2cFee.toFixed(2),
      refundAmount:  refundAmount.toFixed(2)
    })

    // ── Everything atomic: state claim + wallet + audit in ONE transaction ──
    await prisma.$transaction(async (db) => {
      const claim = await db.transaction.updateMany({
        where: { id: transactionId, state: { in: ['held', 'disputed'] } },
        data:  { state: 'refunded', completedAt: new Date() }
      })
      if (claim.count !== 1) {
        throw new Error('ALREADY_PROCESSED')
      }

      // Guard: verify escrow balance is sufficient before decrement
      const walletCheck = await db.wallet.findUnique({
        where:  { userId: tx.buyerId },
        select: { escrowBalance: true }
      })
      if (!walletCheck) throw new Error(`refundBuyer: wallet not found for buyer ${tx.buyerId}`)
      if (new Decimal(walletCheck.escrowBalance).lt(gross)) {
        logger.error('refundBuyer: escrowBalance insufficient — aborting refund', {
          transactionId, escrowBalance: walletCheck.escrowBalance.toString(), required: gross.toString()
        })
        throw new Error(`refundBuyer: insufficient escrow balance`)
      }
      const updatedWallet = await db.wallet.update({
        where:  { userId: tx.buyerId },
        data:   { escrowBalance: { decrement: gross }, lastUpdated: new Date() },
        select: { availableBalance: true, escrowBalance: true }
      })

      // Platform fee is earned revenue even on a refund — route it to the platform wallet,
      // same as releaseFunds does. The B2C return cost is a real cost paid to Safaricom,
      // not platform revenue, so it's simply removed from escrow and not credited anywhere.
      const pw = require('../utils/platformWallet')
      await pw.credit(db, platformFee.toNumber(), transactionId)

      await db.auditLog.create({
        data: {
          id:          crypto.randomUUID(),
          actorType:   'system', action: 'buyer_refunded',
          entityType:  'Transaction', entityId: transactionId,
          transactionId, amount: refundAmount.toFixed(2),
          newState: {
            state:            'refunded',
            grossAmount:      gross.toString(),
            refundAmount:     refundAmount.toString(),
            platformFee:      platformFee.toString(),
            returnB2cFee:     returnB2cFee.toString(),
            availableBalance: updatedWallet.availableBalance.toString(),
            escrowBalance:    updatedWallet.escrowBalance.toString()
          }
        }
      })
    }, { timeout: 15000 })

    // Record payout intent BEFORE firing B2C — so retry finds it and skips double-payout
    await prisma.payout.upsert({
      where:  { transactionId_payoutType: { transactionId, payoutType: 'refund' } },
      create: {
        transactionId,
        payoutType:        'refund',
        amount:            refundAmount,
        phone:             tx.buyer.phone,
        payoutChannel:     'b2c',
        payoutDestination: tx.buyer.phone,
        status:            'pending',
        originatorConversationId: `refund_init_${transactionId}`
      },
      update: { status: 'pending', initiatedAt: new Date() }
    })

    // B2C — send money back to buyer's M-Pesa
    let refundOriginatorId
    try {
      const refundB2cRes = await b2cPayout(tx.buyer.phone, refundAmount.toNumber(), transactionId, 'refund')
      refundOriginatorId = refundB2cRes?.OriginatorConversationID
    } catch (payoutErr) {
      // : same issue as releaseFunds — DB already marked 'refunded' and escrow already
      // decremented. Mark the payout 'failed' on exhausted retries so it surfaces for
      // manual reconciliation instead of sitting silently as 'pending' forever.
      logger.error('refundBuyer: Safaricom refund failed after retries — marking failed', {
        transactionId, error: payoutErr.message
      })
      await prisma.payout.update({
        where: { transactionId_payoutType: { transactionId, payoutType: 'refund' } },
        data:  { status: 'failed' }
      })
      await prisma.auditLog.create({
        data: {
          id:          crypto.randomUUID(),
          actorType:   'system', action: 'refund_payout_failed',
          entityType:  'Transaction', entityId: transactionId,
          amount:      refundAmount.toFixed(2),
          newState:    { state: 'refunded', payoutStatus: 'failed', error: payoutErr.message },
          transactionId
        }
      })
      throw payoutErr
    }
    if (refundOriginatorId) {
      await prisma.payout.update({
        where: { transactionId_payoutType: { transactionId, payoutType: 'refund' } },
        data:  { status: 'sent', originatorConversationId: refundOriginatorId }
      })
    }

    // SMS is fire-and-forget queue — acceptable outside transaction
    await smsQueue.add('bundle_refunded', {
      type:        'bundle_refunded',
      phone:       tx.buyer.phone,
      amount:      refundAmount.toString(),
      referenceNo: tx.referenceNo
    })

    logger.info('Buyer refunded', { transactionId, refundAmount })

  } catch (err) {
    if (err.message === 'ALREADY_PROCESSED') {
      logger.info('refundBuyer: already processed — idempotent skip', { transactionId })
      return
    }
    logger.error('refundBuyer: failed', { transactionId, error: err.message })
    throw err
  } finally {
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end`
    await redis.eval(luaScript, 1, lockKey, lockVal)
  }
}

// ─── TIMER HANDLERS (called by timerWorker) ──────
const handleSellerDeliveryDeadline = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: { buyer: { select: { phone: true } } }
  })
  if (!tx || tx.state !== 'held') return
  logger.info('Seller delivery deadline reached — refunding buyer', { transactionId })
  await refundBuyer(transactionId)
  await prisma.timerJob.updateMany({
    where: { transactionId, jobType: 'seller_delivery_deadline', status: 'pending' },
    data:  { status: 'fired', firedAt: new Date() }
  })
}

const handleDeliveryReminder = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: { seller: { select: { phone: true } } }
  })
  if (!tx || tx.state !== 'held') return
  await smsQueue.add('delivery_reminder', {
    type:          'delivery_reminder',
    phone:         tx.seller.phone,
    transactionId,
    amount:        (tx.sellerReceives ?? tx.amount).toString(),
    referenceNo:   tx.referenceNo
  })
  await prisma.timerJob.updateMany({
    where: { transactionId, jobType: 'delivery_reminder', status: 'pending' },
    data:  { status: 'fired', firedAt: new Date() }
  })
}

const handlePaymentExpiry = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
  if (!tx || !['initiated', 'payment_pending'].includes(tx.state)) return
  await prisma.transaction.update({ where: { id: transactionId }, data: { state: 'expired' } })
  await prisma.timerJob.updateMany({
    where: { transactionId, jobType: 'payment_expiry', status: 'pending' },
    data:  { status: 'fired', firedAt: new Date() }
  })
  logger.info('Transaction expired — no payment', { transactionId })
}

const handleAutoRelease = async (transactionId) => {
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
    if (!tx || !['delivered', 'confirmed'].includes(tx.state)) return
    logger.info('Auto-releasing — buyer silent', { transactionId })
    await prisma.timerJob.updateMany({
      where: { transactionId, jobType: 'auto_release', status: 'pending' },
      data:  { status: 'fired', firedAt: new Date() }
    })
    // releaseFunds only accepts 'confirmed' or 'held'. Without this transition,
    // a tx still in 'delivered' state hits releaseFunds' state guard and silently
    // no-ops — the timer fires but nothing actually releases.
    if (tx.state === 'delivered') {
      await prisma.transaction.update({
        where: { id: transactionId },
        data:  { state: 'confirmed' }
      })
    }
    await releaseFunds(transactionId)
  } catch (error) {
    logger.error('Auto-release failed', { transactionId, error: error.message })
  }
}

const handleDisputeDeadline = async (transactionId) => {
  const tx = await prisma.transaction.findUnique({
    where:   { id: transactionId },
    include: {
      buyer:  { select: { id: true, phone: true } },
      seller: { select: { id: true, phone: true } }
    }
  })
  if (!tx || tx.state !== 'disputed') return

  const dispute = await prisma.dispute.findFirst({
    where: { transactionId, status: 'open' }
  })
  if (!dispute) return

  // ── Check 1: OTP already verified — seller wins instantly ──
  if (tx.otpVerifiedAt) {
    logger.info('Dispute: OTP already verified — seller wins instantly', { transactionId })
    await prisma.dispute.updateMany({ where: { transactionId, status: 'open' }, data: { status: 'resolved_seller', resolutionAction: 'full_release', resolutionNote: 'OTP verified before dispute — seller wins', resolvedAt: new Date() } })
    await prisma.timerJob.updateMany({ where: { transactionId, jobType: 'dispute_deadline', status: 'pending' }, data: { status: 'fired', firedAt: new Date() } })
    await prisma.transaction.update({ where: { id: transactionId }, data: { state: 'confirmed' } })
    await releaseFunds(transactionId)
    return
  }

  // ── Check 2: SMS failed OR status unknown — escalate, never auto-resolve blind ──
  if (!tx.smsDeliveryStatus || tx.smsDeliveryStatus === 'pending' || tx.smsDeliveryStatus === 'failed') {
    const reason = tx.smsDeliveryStatus === 'failed'
      ? 'OTP SMS failed to deliver — possible network issue, admin must review'
      : 'OTP SMS delivery status unknown or pending — cannot auto-resolve, admin must review'
    logger.info('Dispute: SMS status not confirmed — escalating to admin', { transactionId, smsDeliveryStatus: tx.smsDeliveryStatus })
    await prisma.dispute.updateMany({ where: { transactionId, status: 'open' }, data: { status: 'escalated', resolutionNote: reason } })
    await prisma.timerJob.updateMany({ where: { transactionId, jobType: 'dispute_deadline', status: 'pending' }, data: { status: 'fired', firedAt: new Date() } })
    return
  }

  // ── Fallback scoring — only objective, non-seller-controlled signals ──
  // notifyPhoneMatches REMOVED — seller-provided data, proves nothing about delivery
  // Max score = 2. Score 0-1 → buyer wins. Score 2 → escalate (seller did everything right, human decides).
  const sellerMarkedDelivered = !!tx.deliveredAt
  const deliveredOnTime       = sellerMarkedDelivered && tx.deliveredAt <= tx.confirmationDeadline
  let sellerScore = 0
  const checks    = {}
  checks.sellerMarkedDelivered = sellerMarkedDelivered
  if (sellerMarkedDelivered) sellerScore++
  checks.deliveredOnTime = deliveredOnTime
  if (deliveredOnTime) sellerScore++

  logger.info('Dispute auto-resolution checks', { transactionId, sellerScore, checks })

  let action, resolutionNote, favors

  if (sellerScore <= 1) {
    // Score 0: seller did nothing. Score 1: seller marked delivered but was late.
    // Both favor buyer — no OTP proof, buyer disputed, seller either absent or tardy.
    action         = 'full_refund'
    favors         = 'buyer'
    resolutionNote = `Auto-resolved in favor of buyer. Seller score ${sellerScore}/2. Checks: ${JSON.stringify(checks)}`
  } else {
    // Score 2: seller marked delivered on time — ambiguous, needs human eyes.
    // Never auto-release to seller without OTP proof.
    await prisma.dispute.updateMany({
      where: { transactionId, status: 'open' },
      data:  { status: 'escalated', resolutionNote: `Seller marked delivered on time but buyer disputed. Score: ${sellerScore}/2. Checks: ${JSON.stringify(checks)}. Admin must review.` }
    })
    await prisma.timerJob.updateMany({
      where: { transactionId, jobType: 'dispute_deadline', status: 'pending' },
      data:  { status: 'fired', firedAt: new Date() }
    })
    logger.warn('Dispute escalated — seller on-time but buyer disputed, admin required', { transactionId, sellerScore, checks })
    return
  }

  // ── Execute resolution ──
  const disputeUpdate = await prisma.dispute.updateMany({
    where: { transactionId, status: 'open' },
    data: {
      status:           favors === 'buyer' ? 'resolved_buyer' : 'resolved_seller',
      resolutionAction: action,
      resolutionNote,
      resolvedAt:       new Date()
    }
  })
  // Idempotency — another request already resolved this dispute
  if (disputeUpdate.count !== 1) {
    logger.warn('resolveDispute: dispute not open — idempotent return', { transactionId })
    return
  }
  await prisma.timerJob.updateMany({
    where: { transactionId, jobType: 'dispute_deadline', status: 'pending' },
    data:  { status: 'fired', firedAt: new Date() }
  })

  if (favors === 'buyer') {
    await refundBuyer(transactionId)
    logger.info('Dispute auto-resolved — buyer refunded', { transactionId, checks })
  } else {
    await prisma.transaction.update({ where: { id: transactionId }, data: { state: 'confirmed' } })
    await releaseFunds(transactionId)
    logger.info('Dispute auto-resolved — seller paid', { transactionId, checks })
  }
}


const handleInspectionDeadline = async (transactionId) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where:   { id: transactionId },
      include: { seller: { select: { phone: true } }, buyer: { select: { phone: true } } }
    })
    if (!tx) return
    if (tx.state !== 'delivered') {
      logger.info('handleInspectionDeadline skipped — state is ' + tx.state, { transactionId })
      return
    }

    // Don't treat buyer silence as confirmation if we have no evidence the
    // OTP notification ever reached them. Check the push Notification row
    // created alongside the OTP send — if Expo confirmed it failed, or no
    // row exists at all, escalate to a dispute instead of blind-releasing.
    const otpNotif = await prisma.notification.findFirst({
      where: { transactionId, type: 'bundle_otp' },
      orderBy: { createdAt: 'desc' }
    })
    if (!otpNotif || otpNotif.status === 'failed' || otpNotif.status === 'pending') {
      logger.warn('handleInspectionDeadline: OTP delivery unconfirmed — escalating instead of auto-release', {
        transactionId, notifStatus: otpNotif?.status || 'no_notification_found'
      })
      await prisma.dispute.create({
        data: {
          transactionId,
          openedBy:        tx.sellerId,
          reason:          'other',
          description:     `System escalation: OTP window expired but push notification status was '${otpNotif?.status ?? 'missing'}'. Cannot confirm buyer was notified — admin must review before releasing funds.`,
          status:          'escalated',
          resolutionNote:  null
        }
      }).catch(err => 
        
        logger.error('Failed to create escalation dispute', { transactionId, err: err.message }
          
        )
      )
      await prisma.timerJob.updateMany({
        where: { transactionId, jobType: { in: ['auto_release', 'inspection_deadline'] }, status: 'pending' },
        data:  { status: 'fired', firedAt: new Date() }
      })
      return
    }

    logger.info('OTP window expired — buyer silent — auto-releasing to seller', { transactionId })
    await prisma.transaction.update({
      where: { id: transactionId },
      data:  { state: 'confirmed', otpCode: null, otpExpiresAt: null }
    })
    await prisma.timerJob.updateMany({
      where: { transactionId, jobType: { in: ['auto_release', 'inspection_deadline'] }, status: 'pending' },
      data:  { status: 'fired', firedAt: new Date() }
    })
    await releaseFunds(transactionId)
    // Only send buyer-specific message — releaseFunds handles seller + buyer release SMS
    if (tx.buyer?.phone) {
      await smsQueue.add('otp_window_missed', {
        type:    'raw',
        phone:   tx.buyer.phone,
        message: `LipaSafe: You did not confirm delivery for Ref ${tx.referenceNo}. Funds released to seller. Contact support if there is an issue.`
      })
    }
  } catch (err) {
    logger.error('handleInspectionDeadline failed', { transactionId, err: err.message })
  }
}

const handleHandoverTimeout = async (transactionId) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where:   { id: transactionId },
      include: { buyer: { select: { phone: true } }, seller: { select: { phone: true } } }
    })
    if (!tx) return
    if (tx.state !== 'held') {
      logger.info('handleHandoverTimeout skipped — state is ' + tx.state, { transactionId })
      return
    }
    logger.info('Seller missed 30min delivery window — refunding buyer', { transactionId })
    await refundBuyer(transactionId)
    await prisma.timerJob.updateMany({
      where: { transactionId, jobType: 'handover_timeout', status: 'pending' },
      data:  { status: 'fired', firedAt: new Date() }
    })
    if (tx.seller?.phone) {
      await smsQueue.add('handover_missed', {
        type:    'raw',
        phone:   tx.seller.phone,
        message: `LipaSafe: You missed your 30-minute delivery window for Ref ${tx.referenceNo}. Buyer has been refunded.`
      })
    }
    if (tx.listingId) {
      await prisma.secondHandListing.update({
        where: { id: tx.listingId },
        data:  { status: 'active', lockedAt: null }
      })
    }
  } catch (err) {
    logger.error('handleHandoverTimeout failed', { transactionId, err: err.message })
  }
}


// ─── RECOVERY: FINALIZE STUCK PAYOUT_PENDING TRANSACTIONS ───────────────────

const recoverStuckPayouts = async () => {
  logger.info('Starting stuck payout recovery')

  // ── Stuck release payouts — B2C sent but tx still payout_pending ──
  const RECOVERY_MIN_AGE_MS = 10 * 60 * 1000
  const recoveryAgeCutoff = new Date(Date.now() - RECOVERY_MIN_AGE_MS)

  const stuckPayouts = await prisma.payout.findMany({
    where: {
      status:     'sent',
      payoutType: 'full',
      initiatedAt: { lte: recoveryAgeCutoff },
      transaction: { state: 'payout_pending' }
    },
    include: { transaction: true },
    take: 50
  })

  // ── Stuck refund payouts — B2C sent, payout never marked completed ──
  const stuckRefundPayouts = await prisma.payout.findMany({
    where: {
      status:     'sent',
      payoutType: 'refund',
      initiatedAt: { lte: recoveryAgeCutoff },
      transaction: { state: 'refunded' }
    },
    include: { transaction: true },
    take: 50
  })

  logger.info(`Found ${stuckPayouts.length} stuck release(s) and ${stuckRefundPayouts.length} stuck refund(s)`)

  // ── Recover stuck refund payouts first — simpler, just mark completed ──
  for (const payout of stuckRefundPayouts) {
    const tx      = payout.transaction
    const lockKey = `lock:recover:refund:${tx.id}`
    const lockVal = crypto.randomUUID()
    const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 60)
    if (!acquired) {
      logger.warn('recoverStuckPayouts: refund lock not acquired — skipping', { transactionId: tx.id })
      continue
    }
    try {
      await prisma.payout.update({
        where: { transactionId_payoutType: { transactionId: tx.id, payoutType: 'refund' } },
        data:  { status: 'recovered', completedAt: new Date() }
      })
      await prisma.auditLog.create({
        data: {
          id:            crypto.randomUUID(),
          actorType:     'system', action: 'refund_payout_recovery',
          entityType:    'Transaction', entityId: tx.id,
          amount:        tx.amount.toFixed(2),
          newState:      { recovery: true, payoutType: 'refund', payoutStatus: 'recovered' },
          transactionId: tx.id
        }
      })
      logger.info('Stuck refund payout recovered', { transactionId: tx.id })
    } catch (err) {
      logger.error('recoverStuckPayouts: refund recovery failed', { transactionId: tx.id, error: err.message })
    } finally {
      const lua = `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`
      await redis.eval(lua, 1, lockKey, lockVal)
    }
  }

  // ── Recover stuck release payouts ──
  for (const payout of stuckPayouts) {
    const tx = payout.transaction

   
    const lockKey  = `lock:recover:${tx.id}`
    const lockVal  = crypto.randomUUID()
    const acquired = await redis.set(lockKey, lockVal, 'NX', 'EX', 60)
    if (!acquired) {
      logger.warn('recoverStuckPayouts: lock not acquired — skipping', { transactionId: tx.id })
      continue
    }

    try {
      logger.warn('Recovering stuck payout', { transactionId: tx.id, payoutId: payout.id })
      const platformFee = fromDecimal(tx.platformFee)

      await prisma.$transaction(async (db) => {
        const claim = await db.transaction.updateMany({
          where: { id: tx.id, state: 'payout_pending' },
          data:  { state: 'released', completedAt: new Date() }
        })
        if (claim.count !== 1) throw new Error('ALREADY_PROCESSED')

        const pw = require('../utils/platformWallet')
        await pw.credit(db, platformFee.toNumber(), tx.id)

        await db.payout.updateMany({
          where: { transactionId: tx.id, payoutType: 'full' },
          data:  { status: 'recovered' }
        })

        await db.auditLog.create({
          data: {
            id:            crypto.randomUUID(),
            actorType:     'system', action: 'funds_released_recovery',
            entityType:    'Transaction', entityId: tx.id,
            amount:        tx.amount.toFixed(2),
            newState:      { state: 'released', recovery: true, payoutStatus: 'recovered' },
            transactionId: tx.id
          }
        })
      }, { timeout: 15000 })

      logger.info('Stuck payout recovered', { transactionId: tx.id })
    } catch (err) {
      if (err.message === 'ALREADY_PROCESSED') {
        logger.info('recoverStuckPayouts: already released — skip', { transactionId: tx.id })
        continue
      }
      logger.error('recoverStuckPayouts: failed to recover', { transactionId: tx.id, error: err.message })
    } finally {
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end`
      await redis.eval(luaScript, 1, lockKey, lockVal)
    }
  }

  logger.info('Stuck payout recovery completed')
}

module.exports = {
  scheduleTimer, cancelTimer, b2cPayout, recoverStuckPayouts, findOrCreateSeller,
  processEscrowPayment, releaseFunds, refundBuyer, b2bPayout, b2bPayout,
  handleDeliveryReminder, handlePaymentExpiry, handleAutoRelease, handleDisputeDeadline, handleSellerDeliveryDeadline,
  handleInspectionDeadline, handleHandoverTimeout,
  normalizePhone, generateRef, generateOtp,
  PLATFORM_FEE_RATE, PAYMENT_EXPIRY_DELAY, DELIVERY_REMINDER_DELAY, AUTO_RELEASE_DELAY, DISPUTE_DEADLINE_DELAY, OTP_WINDOW
}