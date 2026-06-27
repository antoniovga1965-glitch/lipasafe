'use strict'
const { spawn } = require('child_process')
const Decimal    = require('decimal.js')
const axios      = require('axios')
const prisma     = require('../utils/prisma')
const logger     = require('../utils/logger')
const smsQueue   = require('../queues/smsQueue')
const b2cRetryQueue = require('../queues/b2cRetryQueue')
const pw           = require('../utils/platformWallet')
const { calcFees } = require('../utils/feeCalculator')
const path = require('path')

const CV_SERVICE_URL = process.env.CV_SERVICE_URL || 'http://localhost:5001'

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  let normalized
  if (p.startsWith('+254'))     normalized = p.slice(1)
  else if (p.startsWith('0'))   normalized = '254' + p.slice(1)
  else if (p.startsWith('254')) normalized = p
  else throw new Error(`Invalid phone number: ${phone}`)
  if (!/^254\d{9}$/.test(normalized)) throw new Error(`Invalid phone number: ${phone}`)
  return normalized
}

const logTimeline = async (db, orderId, event, actor, details = {}) => {
  await db.deliveryTimeline.create({
    data: { orderId, event, actor, details: JSON.stringify(details), timestamp: new Date() },
  })
}

// ─── LAZY CV SPAWN ───────────────────────────────
const CV_SCRIPT = path.join(__dirname, '../python/dispute_cv.py')
let cvProcess   = null

const startCv = () => new Promise((resolve, reject) => {
  if (cvProcess) return resolve()
  cvProcess = spawn('python3', [CV_SCRIPT], { detached: false, stdio: 'ignore' })
  cvProcess.on('error', (err) => {
    cvProcess = null
    reject(new Error(`CV spawn failed: ${err.message}`))
  })
  const start = Date.now()
  const poll = setInterval(async () => {
    try {
      await axios.get(`${CV_SERVICE_URL}/health`, { timeout: 1000 })
      clearInterval(poll)
      resolve()
    } catch (err){
      console.error(err)
      if (Date.now() - start > 10000) {
        clearInterval(poll)
        reject(new Error('CV service did not start in time'))
      }
    }
  }, 500)
})

const stopCv = () => {
  if (!cvProcess) return
  try { cvProcess.kill('SIGTERM') } catch {}
  cvProcess = null
  logger.info('CV service stopped')
}

// ─── COMPARE PHOTOS VIA CV SERVICE ───────────────
const comparePhotos = async (orderId) => {
  const photos = await prisma.deliveryPhoto.findMany({
    where:   { orderId },
    select:  { photoType: true, cloudinaryUrl: true },
  })
  const before = photos.find(p => p.photoType === 'BEFORE')?.cloudinaryUrl || null
  const during = photos.find(p => p.photoType === 'DURING')?.cloudinaryUrl || null
  const after  = photos.find(p => p.photoType === 'AFTER')?.cloudinaryUrl  || null
  if (!before) throw new Error('BEFORE photo not found — cannot compare')

  await startCv()
  logger.info('CV service started for dispute comparison', { orderId })

  try {
    const res = await axios.post(`${CV_SERVICE_URL}/compare`, {
      beforeUrl: before,
      duringUrl: during,
      afterUrl:  after,
    }, { timeout: 30000 })
    return { ...res.data, beforePhotoUrl: before, duringPhotoUrl: during, afterPhotoUrl: after }
  } finally {
    stopCv()
  }
}

// ─── OPEN DISPUTE ─────────────────────────────────
const openDispute = async ({ orderId, claimerType, reason, claimerId }) => {
  // secondhand fast-path
  if (claimerType === 'BUYER') {
    const shTx = await prisma.transaction.findFirst({
      where: { id: orderId, category: 'second_hand', buyerId: claimerId, state: { in: ['confirmed', 'held'] } }
    })
    if (shTx) {
      const dup = await prisma.dispute.findFirst({ where: { transactionId: orderId } })
      if (dup) throw new Error('A dispute already exists for this transaction')
      if (shTx.confirmationDeadline && new Date() > new Date(shTx.confirmationDeadline))
        throw new Error('Inspection window has expired. Funds have been auto-released.')
      await prisma.$transaction(async (db) => {
        await db.transaction.update({ where: { id: orderId }, data: { state: 'disputed' } })
        await db.dispute.create({ data: {
          transactionId: orderId, openedBy: claimerId, reason, status: 'open',
          responseDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000)
        }})
        await db.auditLog.create({ data: {
          actorId: claimerId, actorType: 'user', action: 'second_hand_dispute_opened',
          entityType: 'Transaction', entityId: orderId,
          newState: { state: 'disputed', reason }, transactionId: orderId
        }})
      })
      return { success: true, message: 'Dispute opened. Seller has 4 hours to respond.' }
    }
  }
  // delivery path
  const order = await prisma.deliveryOrder.findUnique({
    where:   { id: orderId },
    include: { escrow: true },
  })
  if (!order) throw new Error('Order not found')

  // verify claimer is actually party to this order
  const normalizedClaimerPhone = null // removed stale req reference
  const isAuthorizedBuyer = claimerType === 'BUYER' && order.buyerId === claimerId
  const isAuthorizedRider = claimerType === 'DELIVERY_GUY' && (
    normalizePhone(order.deliveryGuyPhone) === normalizePhone(claimerId) ||
    order.deliveryGuyPhone === claimerId
  )
  if (!isAuthorizedBuyer && !isAuthorizedRider) {
    throw new Error('Not authorized to open dispute for this order')
  }

  // cannot dispute after money has moved
  if (['COMPLETED', 'REFUNDED'].includes(order.status)) {
    throw new Error('Cannot open dispute — transaction already completed')
  }
  // cannot dispute before goods have arrived
  const DISPUTABLE_STATUSES = ['DELIVERY_PHOTO_UPLOADED', 'AWAITING_RECEIPT']
  if (!DISPUTABLE_STATUSES.includes(order.status)) {
    throw new Error(`Cannot raise dispute at this stage. Order is currently: ${order.status}`)
  }

  // uniqueness enforced by DB constraint — no pre-check needed
  // P2002 on create = duplicate dispute, handled below

  // run CV comparison
  let cvResult = null
  let autoVerdict = null
  try {
    cvResult    = await comparePhotos(orderId)
    autoVerdict = cvResult.verdict // DELIVERY_GUY_FAULT | BUYER_FAULT | PENDING_ADMIN
  } catch (err) {
    console.error(err)
    logger.warn('CV comparison failed — escalating to admin', { orderId, err: err.message })
    autoVerdict = 'PENDING_ADMIN'
  }

  // Map CV confidence + verdict to actionable status
  // High confidence clear verdict → auto-resolve
  // Medium confidence → open for admin review with CV evidence
  // Low confidence or CV failure → escalate to admin
  let disputeStatus
const confidence = cvResult?.confidence || 0
if (autoVerdict === 'PENDING_ADMIN' || confidence < 50) {
  disputeStatus = 'PENDING_ADMIN'
} else if (confidence >= 85 && ['DELIVERY_GUY_FAULT', 'BUYER_FAULT'].includes(autoVerdict)) {
  disputeStatus = 'AUTO_RESOLVED'
} else {
  disputeStatus = 'OPEN'
}

  let dispute
  try {
    dispute = await prisma.$transaction(async (db) => {
      const d = await db.deliveryDispute.create({
        data: {
          order: { connect: { id: orderId } },
          claimerType,
          reason,
          status:           disputeStatus,
          ...(cvResult ? {
            photoComparison: {
              create: {
                beforePhotoUrl:   cvResult.beforePhotoUrl,
                duringPhotoUrl:   cvResult.duringPhotoUrl,
                afterPhotoUrl:    cvResult.afterPhotoUrl   || null,
                resembleScore:    cvResult.scores?.resemble    ?? null,
                pHashDistance:    cvResult.scores?.pHash       ?? null,
                orbMatches:       cvResult.scores?.orb         ?? null,
                clipSimilarity:   cvResult.scores?.clip        ?? null,
                dinoV2Similarity: cvResult.scores?.dino        ?? null,
                tamperedScore:    cvResult.scores?.tampered    ?? null,
              }
            }
          } : {}),
          cvAnalysisReport: cvResult ? JSON.stringify({
            verdict:    cvResult.verdict,
            confidence: cvResult.confidence,
            issues:     cvResult.issues,
            flags:      cvResult.flags,
          }) : null,
        },
      })
      await db.deliveryOrder.update({ where: { id: orderId }, data: { status: 'DISPUTED' } })
      await logTimeline(db, orderId, 'DISPUTE_OPENED', claimerType, { reason, autoVerdict, confidence: cvResult?.confidence })
      return d
    })
  } catch (err) {
    console.error(err)
    if (err.code === 'P2002') throw new Error('Dispute already exists for this order')
    throw err
  }

  // suppress opening SMS if auto-resolved — resolveDispute will send outcome SMS directly
  const buyer = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })
  if (disputeStatus !== 'AUTO_RESOLVED') {
    await smsQueue.add('send-sms', {
      to:      normalizePhone(buyer.phone),
      message: `LipaSafe: Dispute opened for order ${orderId.slice(0,8).toUpperCase()}. We are reviewing the evidence. You will be notified of the outcome.`,
    }, { jobId: `dispute-opened-buyer-${orderId}` })
    await smsQueue.add('send-sms', {
      to:      normalizePhone(order.deliveryGuyPhone),
      message: `LipaSafe: A dispute has been raised for order ${orderId.slice(0,8).toUpperCase()}. We are reviewing photo evidence. You will be notified.`,
    }, { jobId: `dispute-opened-dg-${orderId}` })
  }

  // Auto-trigger payout or refund if CV confidence is high enough
  if (disputeStatus === 'AUTO_RESOLVED') {
    try {
      if (autoVerdict === 'DELIVERY_GUY_FAULT') {
        // buyer wins — refund
        await resolveDispute({
          disputeId:  dispute.id,
          resolution: 'REFUND',
          adminNotes: `Auto-resolved by CV. Confidence: ${cvResult.confidence}. Verdict: ${autoVerdict}`,
          adminId:    'system',
        })
        logger.info('Dispute auto-resolved — refund triggered', { orderId, confidence: cvResult.confidence })
      } else if (autoVerdict === 'BUYER_FAULT') {
        // delivery guy wins — payout
        await resolveDispute({
          disputeId:  dispute.id,
          resolution: 'PAY',
          adminNotes: `Auto-resolved by CV. Confidence: ${cvResult.confidence}. Verdict: ${autoVerdict}`,
          adminId:    'system',
        })
        logger.info('Dispute auto-resolved — payout triggered', { orderId, confidence: cvResult.confidence })
      }
    } catch (autoErr) {
      console.error(autoErr)
      // auto-resolution failed — fall back to admin review, don't crash the dispute open
      logger.error('Auto-resolution failed — falling back to PENDING_ADMIN', { orderId, err: autoErr.message })
      await prisma.deliveryDispute.update({
        where: { id: dispute.id },
        data:  { status: 'PENDING_ADMIN' },
      })
      await logTimeline(prisma, orderId, 'DISPUTE_AUTO_RESOLUTION_FAILED', 'SYSTEM', { err: autoErr.message })
    }
  }
  // explicit audit trail for auto-resolution outcome
  if (disputeStatus === 'AUTO_RESOLVED') {
    const auditEvent = autoVerdict === 'DELIVERY_GUY_FAULT'
      ? 'DISPUTE_AUTO_RESOLVED_REFUND'
      : 'DISPUTE_AUTO_RESOLVED_PAY'
    await logTimeline(prisma, orderId, auditEvent, 'SYSTEM', {
      verdict:    autoVerdict,
      confidence: cvResult?.confidence,
      adminId:    'system',
    })
  }

  logger.info('Dispute opened', { orderId, disputeId: dispute.id, autoVerdict, confidence: cvResult?.confidence })
  return {
    success:     true,
    disputeId:   dispute.id,
    autoVerdict,
    confidence:  cvResult?.confidence || null,
    issues:      cvResult?.issues     || [],
    flags:       cvResult?.flags      || [],
    status:      disputeStatus,
  }
}

// ─── RESOLVE DISPUTE (ADMIN) ──────────────────────
async function resolveDispute({ disputeId, resolution, adminNotes, adminId }) {
  const dispute = await prisma.deliveryDispute.findUnique({
    where:   { id: disputeId },
    include: { order: { include: { escrow: true } } },
  })
  if (!dispute)                          throw new Error('Dispute not found')
  if (dispute.status === 'RESOLVED')     throw new Error('Dispute already resolved')

  const order  = dispute.order
  const escrow = order.escrow
  const buyer  = await prisma.user.findUnique({ where: { id: order.buyerId }, select: { phone: true } })

  if (resolution === 'REFUND') {
    // principal only — platform fee non-refundable
    if (!escrow) throw new Error('Escrow record not found for this order')
    const refundAmount = new Decimal(escrow.amount || 0)
    if (refundAmount.lte(0)) throw new Error(`Invalid escrow amount: ${escrow.amount}`)

    const fees = calcFees(order.amount)
    const platformFee = fees.platformFee

    await prisma.$transaction(async (db) => {
      await db.deliveryDispute.update({
        where: { id: disputeId },
        data: {
          status:       'RESOLVED',
          resolution:   'REFUND',
          adminNotes:   adminNotes || null,
          resolvedAt:   new Date(),
          adminAssignedTo: adminId || null,
        },
      })
      await db.deliveryOrder.update({
        where: { id: order.id },
        data:  { status: 'PAYMENT_PROCESSING' },
      })
      await logTimeline(db, order.id, 'DISPUTE_RESOLVED_REFUND', 'ADMIN', { adminNotes, refundAmount: refundAmount.toString() })
      // Credit platform fee — non-refundable even when buyer wins
      if (platformFee.gt(0)) await pw.credit(db, Number(platformFee), `dispute-refund-fee-${dispute.id}`)
    })

    // queue refund to buyer — infinite retry same as payout
    await b2cRetryQueue.add('delivery-refund', {
      orderId: order.id,
      phone:   buyer.phone,
      amount:  refundAmount.toString(),
      type:    'delivery-refund',
    })

    // increment delivery guy dispute count — buyer won
    await updateRiskProfile(order.deliveryGuyPhone, 'REFUND')

    await smsQueue.add('send-sms', {
      to:      normalizePhone(buyer.phone),
      message: `LipaSafe: Dispute resolved in your favor. Refund of KES ${refundAmount} is being processed to your M-Pesa.`,
    })
    await smsQueue.add('send-sms', {
      to:      normalizePhone(order.deliveryGuyPhone),
      message: `LipaSafe: Dispute for order ${order.id.slice(0,8).toUpperCase()} resolved. Refund issued to buyer. Your dispute count has been updated.`,
    })

    logger.info('Dispute resolved — refund queued', { disputeId, orderId: order.id, refundAmount: refundAmount.toString() })
    return { success: true, resolution: 'REFUND', refundAmount: refundAmount.toString() }

  } else if (resolution === 'PAY') {
    // delivery guy wins — close dispute, no refund, don't increment risk
    const fees = calcFees(order.amount)
    const platformFee = fees.platformFee

    await prisma.$transaction(async (db) => {
      await db.deliveryDispute.update({
        where: { id: disputeId },
        data: {
          status:          'RESOLVED',
          resolution:      'PAY',
          adminNotes:      adminNotes || null,
          resolvedAt:      new Date(),
          adminAssignedTo: adminId || null,
        },
      })
      await db.deliveryOrder.update({
        where: { id: order.id },
        data:  { status: 'PAYMENT_PROCESSING' },
      })
      await logTimeline(db, order.id, 'DISPUTE_RESOLVED_PAY', 'ADMIN', { adminNotes })
      // Fee credited in B2C callback after payout confirms
    })

    // queue payout to delivery guy
    if (!escrow) throw new Error('Escrow record not found for this order')
    const payAmount = new Decimal(escrow.amount || 0)
    if (payAmount.lte(0)) throw new Error(`Invalid escrow amount: ${escrow.amount}`)
    await b2cRetryQueue.add('delivery-payout', {
      orderId: order.id,
      phone:   order.deliveryGuyPhone,
      amount:  payAmount.toString(),
      type:    'delivery-payout',
    })

    await smsQueue.add('send-sms', {
      to:      normalizePhone(order.deliveryGuyPhone),
      message: `LipaSafe: Dispute for order ${order.id.slice(0,8).toUpperCase()} resolved in your favor. Payment of KES ${escrow.amount} is being processed.`,
    })
    await smsQueue.add('send-sms', {
      to:      normalizePhone(buyer.phone),
      message: `LipaSafe: Dispute for order ${order.id.slice(0,8).toUpperCase()} resolved. Payment released to delivery guy.`,
    })

    logger.info('Dispute resolved — payout queued', { disputeId, orderId: order.id })
    return { success: true, resolution: 'PAY' }

  } else {
    throw new Error('Invalid resolution — must be REFUND or PAY')
  }
}

// ─── UPDATE RISK PROFILE ──────────────────────────
const updateRiskProfile = async (phone, disputeType) => {
  const normalized = normalizePhone(phone)
  const profile    = await prisma.deliveryGuyRiskProfile.upsert({
    where:  { phone: normalized },
    create: {
      phone:          normalized,
      totalDisputes:  1,
      refundDisputes: disputeType === 'REFUND' ? 1 : 0,
      riskScore:      10,
      riskLevel:      'LOW',
      lastDisputeAt:  new Date(),
    },
    update: {
      totalDisputes:  { increment: 1 },
      refundDisputes: disputeType === 'REFUND' ? { increment: 1 } : undefined,
      lastDisputeAt:  new Date(),
    },
  })

  // recalculate risk level — profile already reflects incremented totalDisputes
  // Scale: 0 disputes = 0, 20+ disputes = 100, linear between thresholds
  // LOW: 0-4, MEDIUM: 5-19, HIGH: 20+
  const total = profile.totalDisputes
  let riskLevel, riskScore
  if (total >= 20) {
    riskLevel = 'HIGH'
    riskScore = 100
  } else if (total >= 5) {
    riskLevel = 'MEDIUM'
    // linear scale: 5 disputes = 25, 19 disputes = 95
    riskScore = Math.round(25 + ((total - 5) / 15) * 70)
  } else {
    riskLevel = 'LOW'
    // linear scale: 0 disputes = 0, 4 disputes = 20
    riskScore = Math.round((total / 5) * 25)
  }

  await prisma.deliveryGuyRiskProfile.update({
    where: { phone: normalized },
    data:  { riskLevel, riskScore },
  })

  logger.info('Risk profile updated', { phone: normalized, total, riskLevel })
}

// ─── GET DISPUTE ──────────────────────────────────
const getDispute = async (disputeId) => {
  const dispute = await prisma.deliveryDispute.findUnique({
    where:   { id: disputeId },
    include: {
      order: {
        include: {
          photos:   { select: { photoType: true, cloudinaryUrl: true } },
          timeline: { orderBy: { timestamp: 'asc' } },
          escrow:   true,
        },
      },
    },
  })
  if (!dispute) throw new Error('Dispute not found')
  return { success: true, dispute }
}

// ─── GET ALL OPEN DISPUTES (ADMIN) ────────────────
const getOpenDisputes = async ({ limit = 20, offset = 0 }) => {
  const parsedLimit  = Math.min(Math.max(parseInt(limit) || 20, 1), 100)
  const parsedOffset = Math.max(parseInt(offset) || 0, 0)

  const disputes = await prisma.deliveryDispute.findMany({
    where:   { status: { in: ['OPEN', 'PENDING_ADMIN', 'ESCALATED'] } },
    orderBy: { createdAt: 'asc' },
    take:    parsedLimit,
    skip:    parsedOffset,
    include: {
      order: {
        select: {
          id:               true,
          amount:           true,
          goods:            true,
          status:           true,
          deliveryGuyPhone: true,
          buyerId:          true,
          photos:           { select: { photoType: true, cloudinaryUrl: true } },
        },
      },
    },
  })
  return { success: true, disputes }
}

module.exports = {
  openDispute,
  resolveDispute,
  comparePhotos,
  getDispute,
  getOpenDisputes,
  updateRiskProfile,
}
