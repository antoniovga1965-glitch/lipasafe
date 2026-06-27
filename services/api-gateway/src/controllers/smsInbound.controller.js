'use strict'
const prisma  = require('../utils/prisma')
const logger  = require('../utils/logger')
const { smsQueue, timerQueue } = { smsQueue: require('../queues/smsQueue'), timerQueue: require('../queues/timerQueue') }
const { releaseFunds, generateOtp, normalizePhone, scheduleTimer, OTP_WINDOW } = require('../services/bundleService')

// Africa's Talking posts form-encoded body:


const handleInboundSMS = async (req, res) => {
  // AT expects 200 immediately — process async
  res.status(200).send()

  try {
    const from = normalizePhone((req.body.from || '').toString().trim())
    const text = (req.body.text || '').toString().trim().toUpperCase()

    logger.info('Inbound SMS received', { from, text })

    // ── CONFIRM <REF> — seller marks delivered via SMS ──
    const confirmMatch = text.match(/^CONFIRM\s+([A-Z0-9]+)$/)
    if (confirmMatch) {
      await handleConfirm(from, confirmMatch[1])
      return
    }

    // ── OTP <CODE> <REF> — buyer confirms receipt via SMS ──
    const otpMatch = text.match(/^OTP\s+(\d{6})\s+([A-Z0-9]+)$/)
    if (otpMatch) {
      await handleOtp(from, otpMatch[1], otpMatch[2])
      return
    }

    // ── HELP or unknown ──
    await smsQueue.add('sms_reply', {
      type: 'raw',
      phone: from,
      message: 'LipaSafe: Reply CONFIRM <REF> to mark delivered, or OTP <CODE> <REF> to confirm receipt.'
    })

  } catch (err) {
    logger.error('handleInboundSMS failed', { err: err.message, stack: err.stack })
  }
}

const handleConfirm = async (sellerPhone, referenceNo) => {
  const tx = await prisma.transaction.findFirst({
    where: { referenceNo, state: 'held' },
    include: {
      seller: { select: { id: true, phone: true } },
      buyer:  { select: { id: true, phone: true } }
    }
  })

  if (!tx) {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: sellerPhone,
      message: `LipaSafe: Ref ${referenceNo} not found or already processed.`
    })
    return
  }

  // For till sellers, notifyPhone is the real contact — seller.phone is 'till_XXXX'
  const sellerContact = tx.notifyPhone
    ? normalizePhone(tx.notifyPhone)
    : tx.seller.phone.startsWith('till_') ? null : normalizePhone(tx.seller.phone)

  if (sellerContact && sellerContact !== sellerPhone) {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: sellerPhone,
      message: `LipaSafe: You are not the seller for Ref ${referenceNo}.`
    })
    return
  }

  // Generate OTP and mark delivered
  const otp = generateOtp()
  const otpExpiresAt = new Date(Date.now() + OTP_WINDOW)

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { otpCode: otp, otpExpiresAt, deliveredAt: new Date(), state: 'delivered' }
  })

  // Schedule auto-release in case buyer never responds
  await scheduleTimer(timerQueue, tx.id, 'auto_release', OTP_WINDOW)

  // Send OTP to buyer
  await smsQueue.add('bundle_otp_sms', {
    type: 'bundle_otp_sms_reply',
    phone: normalizePhone(tx.buyer.phone),
    otp,
    referenceNo,
    amount: tx.sellerReceives?.toString() || tx.amount?.toString()
  })

  // Confirm to seller
  await smsQueue.add('sms_reply', {
    type: 'raw', phone: sellerPhone,
    message: `LipaSafe: Delivery confirmed for Ref ${referenceNo}. OTP sent to buyer.`
  })

  logger.info('SMS CONFIRM processed', { referenceNo, sellerPhone })
}

const handleOtp = async (buyerPhone, otp, referenceNo) => {
  const tx = await prisma.transaction.findFirst({
    where: { referenceNo },
    include: {
      buyer: { select: { id: true, phone: true } }
    }
  })

  if (!tx) {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: buyerPhone,
      message: `LipaSafe: Ref ${referenceNo} not found.`
    })
    return
  }

  if (normalizePhone(tx.buyer.phone) !== buyerPhone) {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: buyerPhone,
      message: `LipaSafe: You are not the buyer for Ref ${referenceNo}.`
    })
    return
  }

  if (tx.state !== 'held') {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: buyerPhone,
      message: `LipaSafe: Ref ${referenceNo} is already ${tx.state}.`
    })
    return
  }

  if (!tx.otpCode || tx.otpCode !== otp) {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: buyerPhone,
      message: `LipaSafe: Invalid OTP for Ref ${referenceNo}. Please check and try again.`
    })
    return
  }

  if (tx.otpExpiresAt && new Date() > tx.otpExpiresAt) {
    await smsQueue.add('sms_reply', {
      type: 'raw', phone: buyerPhone,
      message: `LipaSafe: OTP expired for Ref ${referenceNo}. Contact support.`
    })
    return
  }

  // Mark OTP verified, clear OTP so it can't be reused
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      otpVerifiedAt: new Date(),
      state:         'confirmed',
      completedAt:   new Date(),
      otpCode:       null,
      otpExpiresAt:  null
    }
  })

  // Confirm to buyer
  await smsQueue.add('sms_reply', {
    type: 'raw', phone: buyerPhone,
    message: `LipaSafe: Delivery confirmed! Funds releasing to seller. Ref ${referenceNo}. Thank you.`
  })

  logger.info('SMS OTP verified — releasing funds', { referenceNo, buyerPhone })

  // Release funds
  await releaseFunds(tx.id)
}

module.exports = { handleInboundSMS }
