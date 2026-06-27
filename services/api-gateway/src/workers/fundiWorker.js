'use strict'

const { z }      = require('zod')
const prisma     = require('../utils/prisma')
const logger     = require('../utils/logger')
const fundiQueue = require('../queues/fundiQueue')
const { calcFeesFundi } = require('../utils/feeCalculator')


// ── Money helpers: integer cents only (no floating-point errors) ────────────
const toCents = (v) => {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Math.round(n * 100)
}
const fromCents = (c) => (c / 100).toFixed(2)
const moneyMul = (amount, factor) => fromCents(Math.round(toCents(amount) * factor))

// ── Phone normalization (single source of truth) ───────────────────────────
const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}

const INSPECTION_HOURS = 6
const MAX_EXTENSIONS   = 2

// ── Non-blocking audit helper ─────────────────────────────────────────────
const audit = async ({ action, jobId, userId, meta }) => {
  try {
    await prisma.fundiAuditLog.create({
      data: {
        action,
        jobId: jobId || null,
        userId: userId || null,
        meta: meta || {},
        createdAt: new Date(),
      },
    })
  } catch (e) {
    console.error(e)
    logger.warn('Audit log skipped', { action, jobId, error: e.message })
  }
}

// ── CREATE JOB ─────────────────────────────────────────────────────────────
const createJob = async (req, res) => {
  try {
    const schema = z.object({
      fundiPhone:    z.string().regex(/^(?:254|0|\+254)?[17]\d{8}$/, 'Invalid fundi phone'),
      amount:        z.coerce.number().int("Job amount must be a whole number of KES").min(1).max(500000),
      description:   z.string().min(5).max(500),
      durationHours: z.coerce.number().min(1).max(720),
      beforePhotos:  z.array(z.string()).min(0).max(10),
      category:      z.string().max(50).optional(),
      deliverables:  z.array(z.string().max(200)).max(10).optional(),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const buyerId    = req.user.userId
    const fundiPhone = normalizePhone(parsed.data.fundiPhone)
    const amount     = parsed.data.amount

    const buyer = await prisma.user.findUnique({
      where:  { id: buyerId },
      select: { accountStatus: true, phone: true },
    })

    if (!buyer || buyer.accountStatus !== 'active') {
      return res.status(403).json({ success: false, message: 'Account not active' })
    }

    if (buyer.phone === fundiPhone) {
      return res.status(400).json({ success: false, message: 'Cannot hire yourself' })
    }

    const fees = calcFeesFundi(amount)

    const amountStr       = fees.fundiReceives.toFixed(2)
    const serviceFeeStr   = fees.platformFee.toFixed(2)
    const b2cCostStr      = fees.b2cCost.toFixed(2)
    const totalChargedStr = fees.buyerTotal.toFixed(2)

    let job
    try {
      job = await prisma.fundiJob.create({
        data: {
          buyerId,
          fundiPhone,
          buyerPhone:    buyer.phone,        
          amount:        amountStr,
          serviceFee:    serviceFeeStr,
          b2cCost:       b2cCostStr,
          totalCharged:  totalChargedStr,
          description:   parsed.data.description,
          durationHours: parsed.data.durationHours,
          beforePhotos:  parsed.data.beforePhotos,
          category:      parsed.data.category || null,
          deliverables:  parsed.data.deliverables || [],
          status:        'PENDING_PAYMENT',
        },
      })
    } catch (dbErr) {
      // P2002 = Prisma unique constraint violation
      if (dbErr.code === 'P2002' || dbErr.message?.includes('Unique constraint failed')) {
        const existing = await prisma.fundiJob.findFirst({
          where: {
            buyerId,
            fundiPhone,
            status: 'PENDING_PAYMENT',
          },
          select: { id: true, totalCharged: true, createdAt: true },
        })

        return res.status(409).json({
          success:       false,
          message:       'You already have a pending payment for this fundi. Complete or cancel it first.',
          existingJobId: existing?.id ?? null,
        })
      }

      // Not a constraint error — re-throw so outer catch handles it
      throw dbErr
    }

    await audit({ action: 'JOB_CREATED', jobId: job.id, userId: buyerId, meta: { amount: amountStr } })
    logger.info('Fundi job created', { jobId: job.id, buyerId })

    return res.status(201).json({
      success: true,
      message: 'Job created. Proceed to payment.',
      job: {
        id:           job.id,
        amount:       amountStr,
        serviceFee:   serviceFeeStr,
        totalCharged: totalChargedStr,
        status:       job.status,
      },
    })

  } catch (err) {
   console.error(err)
    logger.error('createJob failed', { err: err.message, stack: err.stack, code: err.code, meta: JSON.stringify(err.meta) })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── GET JOB ─────────────────────────────────────────────────────────────────
const getJob = async (req, res) => {
  try {
    const { jobId } = req.params
    const userId    = req.user.userId

    const job = await prisma.fundiJob.findUnique({
      where:   { id: jobId },
      include: { escrow: true, dispute: true },
    })

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' })

    const isBuyer = job.buyerId === userId
    const user    = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    const isFundi = user?.phone ? normalizePhone(user.phone) === job.fundiPhone : false

    if (!isBuyer && !isFundi) {
      return res.status(403).json({ success: false, message: 'Forbidden' })
    }

    return res.json({ success: true, job })
  } catch (err) {
    console.error(err)
    logger.error('getJob failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'internal server error' })
  }
}

// ── LIST BUYER JOBS ─────────────────────────────────────────────────────────
const listMyJobs = async (req, res) => {
  try {
    const buyerId = req.user.userId
    const jobs    = await prisma.fundiJob.findMany({
      where:   { buyerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { escrow: true },
    })
    return res.json({ success: true, jobs })
  } catch (err) {
      console.error(err)
    logger.error('listMyJobs failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── MARK JOB DONE (fundi uploads after photos) ──────────────────────────────
const markJobDone = async (req, res) => {
  try {
    const schema = z.object({
      afterPhotos: z.array(z.string().url()).min(1).max(10),
      notes:       z.string().max(500).optional(),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { jobId } = req.params
    const userId    = req.user.userId

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    const normalizedFundiPhone = normalizePhone(user.phone)

    const completedAt          = new Date()
    const inspectionDeadlineAt   = new Date(completedAt.getTime() + INSPECTION_HOURS * 60 * 60 * 1000)

    // Atomic guard: only ACTIVE/OVERDUE + correct fundi can transition
    const updated = await prisma.fundiJob.updateMany({
      where: {
        id: jobId,
        fundiPhone: normalizedFundiPhone,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
      data: {
        status:               'AWAITING_BUYER_REVIEW',
        afterPhotos:          parsed.data.afterPhotos,
        completedAt,
        inspectionDeadlineAt,
      },
    })

    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: 'Cannot complete job — already processed or invalid status' })
    }

    // Schedule auto-release after inspection window
    await fundiQueue.add('auto_release', { jobId }, {
      delay: INSPECTION_HOURS * 60 * 60 * 1000,
      jobId: `auto_release_${jobId}`,
    })

    // Notify buyer via queue
    await fundiQueue.add('notify_buyer_review', {
      jobId,
      buyerId:    req.user.userId,
      deadlineAt: inspectionDeadlineAt.toISOString(),
    })

    await audit({ action: 'JOB_MARKED_DONE', jobId, userId, meta: {} })
    logger.info('Fundi marked job done', { jobId })

    return res.json({
      success:              true,
      message:              'Job marked complete. Buyer has 12 hours to review.',
      inspectionDeadlineAt,
    })
  } catch (err) {
    console.error(err)
    logger.error('markJobDone failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── BUYER APPROVES ───────────────────────────────────────────────────────────
const approveJob = async (req, res) => {
  try {
    const { jobId } = req.params
    const buyerId   = req.user.userId

    const job = await prisma.fundiJob.findUnique({
      where:   { id: jobId },
      include: { escrow: true },
    })

    if (!job)                    return res.status(404).json({ success: false, message: 'Job not found' })
    if (job.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Not your job' })

    // Atomic status guard — prevents duplicate payouts
    const statusUpdate = await prisma.fundiJob.updateMany({
      where: { id: jobId, buyerId, status: 'AWAITING_BUYER_REVIEW' },
      data:  { status: 'COMPLETED' },
    })

    if (statusUpdate.count === 0) {
      return res.status(400).json({ success: false, message: 'Job already approved or not awaiting review' })
    }

    // Guard escrow so we only release once
    await prisma.fundiEscrow.updateMany({
      where: { jobId, status: { not: 'released' } },
      data:  { status: 'released', releasedAt: new Date() },
    })

    // Queue B2C payout to fundi (deduped by jobId)
    await fundiQueue.add('payout_fundi', {
      jobId,
      fundiPhone: job.fundiPhone,
      amount:     job.amount,
    }, { jobId: `payout_${jobId}` })

    await audit({ action: 'JOB_APPROVED', jobId, userId: buyerId, meta: { amount: job.amount } })
    logger.info('Buyer approved fundi job', { jobId, buyerId })

    return res.json({ success: true, message: 'Job approved. Funds releasing to fundi.' })
  } catch (err) {
    logger.error('approveJob failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── BUYER DISPUTES ───────────────────────────────────────────────────────────
const disputeJob = async (req, res) => {
  try {
    const schema = z.object({
      reason:         z.string().min(5).max(200),
      description:    z.string().max(1000).optional(),
      evidencePhotos: z.array(z.string().url()).max(10).optional(),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { jobId } = req.params
    const buyerId   = req.user.userId

    const job = await prisma.fundiJob.findUnique({ where: { id: jobId } })

    if (!job)                    return res.status(404).json({ success: false, message: 'Job not found' })
    if (job.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Not your job' })

    // Atomic guard — prevents duplicate disputes
    const statusUpdate = await prisma.fundiJob.updateMany({
      where: {
        id: jobId,
        buyerId,
        status: { in: ['AWAITING_BUYER_REVIEW', 'OVERDUE'] },
      },
      data: { status: 'DISPUTED' },
    })

    if (statusUpdate.count === 0) {
      return res.status(400).json({ success: false, message: 'Job already disputed or cannot be disputed in current status' })
    }

    await prisma.fundiDispute.create({
      data: {
        jobId,
        openedBy:       buyerId,
        reason:         parsed.data.reason,
        description:    parsed.data.description,
        evidencePhotos: parsed.data.evidencePhotos || [],
        status:         'OPEN',
      },
    })

    await prisma.fundiEscrow.updateMany({
      where: { jobId },
      data:  { status: 'disputed' },
    })

    await audit({ action: 'JOB_DISPUTED', jobId, userId: buyerId, meta: { reason: parsed.data.reason } })
    logger.info('Fundi job disputed', { jobId, buyerId })

    return res.json({ success: true, message: 'Dispute opened. Admin will review within 24 hours.' })
  } catch (err) {
      console.error(err)
    logger.error('disputeJob failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── EXTEND DEADLINE (buyer option on overdue) ───────────────────────────────
const extendDeadline = async (req, res) => {
  try {
    const schema = z.object({
      extraHours: z.coerce.number().min(1).max(168),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { jobId } = req.params
    const buyerId   = req.user.userId

    const job = await prisma.fundiJob.findUnique({ where: { id: jobId } })

    if (!job)                    return res.status(404).json({ success: false, message: 'Job not found' })
    if (job.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Not your job' })
    if (job.status !== 'OVERDUE') {
      return res.status(400).json({ success: false, message: 'Only overdue jobs can be extended' })
    }

    if (job.extensionCount >= MAX_EXTENSIONS) {
      return res.status(400).json({ success: false, message: `Maximum ${MAX_EXTENSIONS} extensions reached` })
    }

    const newDeadline = new Date(Date.now() + parsed.data.extraHours * 60 * 60 * 1000)

    await prisma.fundiJob.update({
      where: { id: jobId },
      data:  {
        status: 'ACTIVE',
        deadlineAt: newDeadline,
        extensionCount: { increment: 1 },
      },
    })

    // Reschedule deadline check (deduped)
    await fundiQueue.add('check_deadline', { jobId }, {
      delay: parsed.data.extraHours * 60 * 60 * 1000,
      jobId: `deadline_${jobId}`,
    })

    await audit({ action: 'DEADLINE_EXTENDED', jobId, userId: buyerId, meta: { extraHours: parsed.data.extraHours } })
    logger.info('Fundi job deadline extended', { jobId, newDeadline })

    return res.json({ success: true, message: 'Deadline extended.', newDeadline })
  } catch (err) {
      console.error(err)
    logger.error('extendDeadline failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── CANCEL & REFUND (buyer, before acceptance) ──────────────────────────────
const cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params
    const buyerId   = req.user.userId

    const job = await prisma.fundiJob.findUnique({
      where:   { id: jobId },
      include: { escrow: true },
    })

    if (!job)                    return res.status(404).json({ success: false, message: 'Job not found' })
    if (job.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Not your job' })

    const cancellableStatuses = ['PENDING_PAYMENT', 'WAITING_FOR_FUNDI_ACCEPTANCE', 'OVERDUE']

    // Atomic guard
    const statusUpdate = await prisma.fundiJob.updateMany({
      where: { id: jobId, buyerId, status: { in: cancellableStatuses } },
      data:  { status: 'CANCELLED' },
    })

    if (statusUpdate.count === 0) {
      return res.status(400).json({ success: false, message: `Cannot cancel job in status ${job.status}` })
    }

    if (job.escrow) {
      await prisma.fundiEscrow.updateMany({
        where: { jobId, status: { not: 'refunded' } },
        data:  { status: 'refunded', refundedAt: new Date() },
      })

      // Policy: never refund the service fee — refund principal only
      await fundiQueue.add('refund_buyer', {
        jobId,
        buyerId,
        amount: job.amount,
      }, { jobId: `refund_${jobId}` })
    }

    await audit({ action: 'JOB_CANCELLED', jobId, userId: buyerId, meta: { refund: job.amount } })
    logger.info('Fundi job cancelled', { jobId, buyerId })

    return res.json({ success: true, message: 'Job cancelled. Refund initiated.' })
  } catch (err) {
    logger.error('cancelJob failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── LIST SELLER PENDING JOBS ────────────────────────────────────────────────
const listSellerJobs = async (req, res) => {
  try {
    const userId = req.user.userId
    const user   = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    const orders = await prisma.fundiJob.findMany({
      where:   {
        fundiPhone: normalizePhone(user.phone),
        status:     { in: ['ACTIVE', 'OVERDUE', 'WAITING_FOR_FUNDI_ACCEPTANCE'] },
        deletedAt:  null,
      },
      orderBy: { createdAt: 'desc' },
      include: { escrow: true },
    })

    return res.json({ success: true, orders })
  } catch (err) {
    logger.error('listSellerJobs failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── RESEND OTP ──────────────────────────────────────────────────────────────
const resendOtp = async (req, res) => {
  try {
    const { jobId } = req.params
    const buyerId   = req.user.userId

    const job = await prisma.fundiJob.findUnique({
      where:   { id: jobId },
      include: { escrow: true },
    })

    if (!job)                      return res.status(404).json({ success: false, message: 'Job not found' })
    if (job.buyerId !== buyerId)   return res.status(403).json({ success: false, message: 'Forbidden' })
    if (job.status !== 'WAITING_FOR_FUNDI_ACCEPTANCE') {
      return res.status(400).json({ success: false, message: `Cannot resend OTP — job status is ${job.status}` })
    }

    // Rate-limit: max 1 resend per 5 minutes
    const redis      = require('../utils/redis')
    const rateLimKey = `fundi:otp:resend:${jobId}`
    const recentSend = await redis.get(rateLimKey)
    if (recentSend) {
      const ttl = await redis.ttl(rateLimKey)
      return res.status(429).json({
        success: false,
        message: `Please wait ${ttl} seconds before resending`,
      })
    }

    // Generate fresh OTP
    const crypto     = require('crypto')
    const otp        = Math.floor(1000 + Math.random() * 9000).toString()
    const otpHash    = crypto.createHash('sha256').update(otp).digest('hex')
    const otpExpiry  = new Date(Date.now() + 30 * 60 * 1000)

    // Reset attempts + lock, write new hash + expiry
    await prisma.fundiJob.update({
      where: { id: jobId },
      data:  {
        otpHash,
        otpExpiresAt:      otpExpiry,
        otpFailedAttempts: 0,
        otpLockedAt:       null,
      },
    })

    // Re-queue expire_unaccepted with fresh 24h window (deduped)
    await fundiQueue.add(
      'expire_unaccepted',
      { jobId: job.id, buyerId: job.buyerId, amount: job.amount },
      { delay: 24 * 60 * 60 * 1000, jobId: `expire_${job.id}` }
    )

    // Queue SMS to fundi with new OTP
    await fundiQueue.add('send_acceptance_sms', {
      jobId,
      fundiPhone: job.fundiPhone,
      amount:     job.amount,
      otp,
      expiresAt:  otpExpiry.toISOString(),
    })

    // Rate-limit: block resend for 5 min
    await redis.set(rateLimKey, '1', 'EX', 300)

    logger.info('OTP resent', { jobId, fundiPhone: job.fundiPhone })
    return res.json({ success: true, message: 'OTP resent to fundi' })

  } catch (err) {
      console.error(err)
    logger.error('resendOtp failed', { err: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── ADMIN RESOLVE DISPUTE ───────────────────────────────────────────────────
const resolveDispute = async (req, res) => {
  try {
    const { jobId } = req.params
    const { decision, releaseAmount, refundAmount, adminNote } = req.body

    // ── Admin auth guard ──
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }

    // ── Validate decision ──
    const VALID = ['FULL_RELEASE', 'FULL_REFUND', 'PARTIAL']
    if (!VALID.includes(decision)) {
      return res.status(400).json({ success: false, message: `decision must be one of: ${VALID.join(', ')}` })
    }

    // ── Load job with escrow and dispute ──
    const job = await prisma.fundiJob.findUnique({
      where:   { id: jobId },
      include: { escrow: true, dispute: true },
    })

    if (!job)          return res.status(404).json({ success: false, message: 'Job not found' })
    if (!job.dispute)  return res.status(400).json({ success: false, message: 'No dispute on this job' })
    if (job.dispute.status === 'RESOLVED') {
      return res.status(400).json({ success: false, message: 'Dispute already resolved' })
    }
    if (!job.escrow || job.escrow.status !== 'disputed') {
      return res.status(400).json({ success: false, message: `Escrow is not in disputed state (current: ${job.escrow?.status})` })
    }

    const escrowCents = toCents(job.escrow.amount)

    // ── Validate amounts for PARTIAL (cents math) ──
    let releaseCents = 0
    let refundCents  = 0

    if (decision === 'FULL_RELEASE') {
      releaseCents = escrowCents
      refundCents  = 0
    } else if (decision === 'FULL_REFUND') {
      releaseCents = 0
      refundCents  = escrowCents
    } else {
      releaseCents = toCents(releaseAmount)
      refundCents  = toCents(refundAmount)

      if (releaseCents < 0 || refundCents < 0) {
        return res.status(400).json({ success: false, message: 'Amounts cannot be negative' })
      }

      // Allow ±1 KES (100 cents) rounding tolerance
      if (Math.abs((releaseCents + refundCents) - escrowCents) > 100) {
        return res.status(400).json({
          success: false,
          message: `releaseAmount + refundAmount must equal escrow amount (${fromCents(escrowCents)} KES)`,
        })
      }
    }

    // ── Atomic DB update ──
    const ALREADY_RESOLVED = 'ALREADY_RESOLVED'
    try {
      await prisma.$transaction(async (db) => {
        const disputeUpdate = await db.fundiDispute.updateMany({
          where: { jobId, status: { not: 'RESOLVED' } },
          data:  {
            status:        'RESOLVED',
            decision,
            releaseAmount: fromCents(releaseCents),
            refundAmount:  fromCents(refundCents),
            resolvedAt:    new Date(),
            description:   adminNote
              ? `${job.dispute.description || ''}\n\nAdmin note: ${adminNote}`.trim()
              : job.dispute.description,
          },
        })

        if (disputeUpdate.count === 0) throw new Error(ALREADY_RESOLVED)

        await db.fundiEscrow.updateMany({
          where: { jobId, status: { not: 'resolved' } },
          data:  {
            status:                'resolved',
            partialReleasedAmount: releaseCents > 0 ? fromCents(releaseCents) : null,
            partialRefundAmount:   refundCents  > 0 ? fromCents(refundCents)  : null,
            releasedAt:            releaseCents > 0 ? new Date() : null,
            refundedAt:            refundCents  > 0 ? new Date() : null,
          },
        })

        await db.fundiJob.update({
          where: { id: jobId },
          data:  { status: 'RESOLVED' },
        })
      })
    } catch (txErr) {
      if (txErr.message === ALREADY_RESOLVED) {
        return res.status(400).json({ success: false, message: 'Dispute already resolved' })
      }
      throw txErr
    }

    const buyer = await prisma.user.findUnique({
      where: { id: job.buyerId }, select: { phone: true },
    })

    // ── Queue B2C payouts (deduped) ──
    if (releaseCents > 0) {
      await fundiQueue.add('payout_fundi', {
        jobId,
        fundiPhone: job.fundiPhone,
        amount:     fromCents(releaseCents),
      }, { jobId: `payout_${jobId}` })
    }

    if (refundCents > 0 && buyer) {
      await fundiQueue.add('refund_buyer', {
        jobId,
        buyerId: job.buyerId,
        amount:  fromCents(refundCents),
      }, { jobId: `refund_${jobId}` })
    }

    // ── Notify both parties via SMS ──
    const jobRef = jobId.slice(0,8).toUpperCase()
    if (decision === 'FULL_RELEASE') {
      await fundiQueue.add('send_raw_sms', {
        phone:   job.fundiPhone,
        message: `LipaSafe: Dispute resolved. KES ${fromCents(releaseCents)} itatolewa kwako. Job: ${jobRef}`,
      })
      if (buyer) await fundiQueue.add('send_raw_sms', {
        phone:   buyer.phone,
        message: `LipaSafe: Dispute resolved. Funds released to fundi. Job: ${jobRef}`,
      })
    } else if (decision === 'FULL_REFUND') {
      if (buyer) await fundiQueue.add('send_raw_sms', {
        phone:   buyer.phone,
        message: `LipaSafe: Dispute resolved. KES ${fromCents(refundCents)} itarudishwa kwako. Job: ${jobRef}`,
      })
      await fundiQueue.add('send_raw_sms', {
        phone:   job.fundiPhone,
        message: `LipaSafe: Dispute resolved. Refund imetolewa kwa buyer. Job: ${jobRef}`,
      })
    } else {
      await fundiQueue.add('send_raw_sms', {
        phone:   job.fundiPhone,
        message: `LipaSafe: Dispute resolved. Utapokea KES ${fromCents(releaseCents)} kwa job ${jobRef}`,
      })
      if (buyer) await fundiQueue.add('send_raw_sms', {
        phone:   buyer.phone,
        message: `LipaSafe: Dispute resolved. Utapokea refund ya KES ${fromCents(refundCents)} kwa job ${jobRef}`,
      })
    }

    await audit({
      action: 'DISPUTE_RESOLVED',
      jobId,
      userId: req.user.userId,
      meta: { decision, release: fromCents(releaseCents), refund: fromCents(refundCents) },
    })

    return res.json({
      success: true,
      message: `Dispute resolved: ${decision}`,
      data: { jobId, decision, release: fromCents(releaseCents), refund: fromCents(refundCents) },
    })

  } catch (err) {
      console.error(err)
    logger.error('resolveDispute failed', { err: err.message, stack: err.stack })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── IN-APP ACCEPT JOB (fundi side) ─────────────────────────────────────────
const acceptJob = async (req, res) => {
  try {
    const { jobId } = req.params
    const { otp }   = req.body
    const userId    = req.user.userId

    if (!otp) return res.status(400).json({ success: false, message: 'OTP is required' })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    const normalizedUserPhone = normalizePhone(user.phone)

    const job = await prisma.fundiJob.findUnique({
      where:   { id: jobId },
      include: { escrow: true },
    })

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' })

    if (normalizedUserPhone !== normalizePhone(job.fundiPhone)) {
      return res.status(403).json({ success: false, message: 'This job is not assigned to you' })
    }

    if (job.status !== 'WAITING_FOR_FUNDI_ACCEPTANCE') {
      return res.status(400).json({ success: false, message: `Job cannot be accepted — status is ${job.status}` })
    }

    // Check OTP lock
    if (job.otpLockedAt) {
      return res.status(429).json({ success: false, message: 'Too many failed attempts. Ask buyer to resend OTP.' })
    }

    // Check expiry
    if (job.otpExpiresAt && new Date() > new Date(job.otpExpiresAt)) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Ask buyer to resend.' })
    }

    // Verify OTP hash
    const crypto  = require('crypto')
    const otpHash = crypto.createHash('sha256').update(otp.toString().trim()).digest('hex')

    if (otpHash !== job.otpHash) {
      const attempts = job.otpFailedAttempts + 1
      const lockNow  = attempts >= 3
      await prisma.fundiJob.update({
        where: { id: jobId },
        data:  {
          otpFailedAttempts: attempts,
          otpLockedAt: lockNow ? new Date() : null,
        },
      })
      if (lockNow) {
        return res.status(429).json({ success: false, message: 'Too many failed attempts. Ask buyer to resend OTP.' })
      }
      return res.status(400).json({ success: false, message: `Incorrect OTP. ${3 - attempts} attempt(s) remaining.` })
    }

    // ── OTP correct — activate job atomically ──
    const now        = new Date()
    const deadlineAt = new Date(now.getTime() + job.durationHours * 60 * 60 * 1000)

    // Atomic guard: exact OTP hash + no lock + expected status
    const activated = await prisma.fundiJob.updateMany({
      where: {
        id: jobId,
        fundiPhone: normalizedUserPhone,
        status: 'WAITING_FOR_FUNDI_ACCEPTANCE',
        otpHash,
        otpLockedAt: null,
      },
      data: {
        status:            'ACTIVE',
        acceptedAt:        now,
        deadlineAt,
        otpFailedAttempts: 0,
        otpLockedAt:       null,
        otpHash:           null,
        otpExpiresAt:      null,
      },
    })

    if (activated.count === 0) {
      return res.status(400).json({ success: false, message: 'Job already accepted or OTP invalidated' })
    }

    await prisma.fundiEscrow.updateMany({
      where: { jobId, status: { not: 'active' } },
      data:  { status: 'active' },
    })

    // Cancel the expire_unaccepted BullMQ job
    await fundiQueue.remove(`expire_${jobId}`).catch(() => {})

    // Queue check_deadline job (deduped)
    await fundiQueue.add(
      'check_deadline',
      { jobId, buyerId: job.buyerId },
      { delay: job.durationHours * 60 * 60 * 1000, jobId: `deadline_${jobId}` }
    )

    // Load buyer phone if missing
    const buyerPhone = job.buyerPhone || (await prisma.user.findUnique({
      where: { id: job.buyerId }, select: { phone: true }
    }))?.phone || ''

    // Notify buyer via SMS
    await fundiQueue.add('send_raw_sms', {
      phone:   buyerPhone,
      message: `LipaSafe: Fundi amekubali kazi. Muda wa kukamilisha: ${job.durationHours}h. Job: ${jobId.slice(0,8).toUpperCase()}`,
    })

    await audit({ action: 'JOB_ACCEPTED', jobId, userId, meta: {} })
    logger.info('Fundi accepted job in-app', { jobId, fundiUserId: userId })

    return res.json({
      success: true,
      message: 'Job accepted. Timer started.',
      data: { jobId, status: 'ACTIVE', deadlineAt },
    })

  } catch (err) {
      console.error(err)
    logger.error('acceptJob failed', { err: err.message, stack: err.stack })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId    = req.user.userId;
    const job = await prisma.fundiJob.findUnique({ where: { id: jobId }, select: { buyerId: true, status: true } });
    if (!job)                   return res.status(404).json({ success: false, message: 'Job not found' });
    if (job.buyerId !== userId) return res.status(403).json({ success: false, message: 'Not authorized' });
    const moneyHeld = ['WAITING_FOR_FUNDI_ACCEPTANCE','ACTIVE','AWAITING_BUYER_REVIEW','OVERDUE','DISPUTED']
    if (moneyHeld.includes(job.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete — job is active or disputed' })
    }
    await prisma.fundiJob.update({ where: { id: jobId }, data: { deletedAt: new Date() } });
    return res.json({ success: true, message: 'Job deleted' });
  } catch (err) {
    logger.error('deleteJob error', { err: err.message });
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};

module.exports = {
  createJob,
  getJob,
  listMyJobs,
  markJobDone,
  approveJob,
  disputeJob,
  extendDeadline,
  cancelJob,
  listSellerJobs,
  resendOtp,
  resolveDispute,
  acceptJob,
  deleteJob,
}