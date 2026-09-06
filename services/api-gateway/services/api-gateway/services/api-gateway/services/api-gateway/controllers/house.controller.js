'use strict'
const { z }   = require('zod')
const Decimal = require('decimal.js')
const { calcFeesBuyerSide } = require('../src/utils/feeCalculator')
const prisma  = require('../src/utils/prisma')
const logger  = require('../src/utils/logger')

// SERVICE_FEE_RATE removed — use feeCalculator.js

// ── Create escrow ──────────────────────────────────────────────────────────
const createHouseEscrow = async (req, res) => {
  try {
    const schema = z.object({
      sellerPhone:     z.string().min(9),
      serviceType:     z.string().min(2).default('general'),
      description:     z.string().min(5),
      area:            z.string().min(2),
      amount:          z.number().min(1, 'Minimum amount is KES 20'),
      protectionHours: z.number().int().min(1).max(168).default(24),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { sellerPhone: rawSellerPhone, serviceType, description, area, amount: rawAmount, protectionHours } = parsed.data

    // Normalize sellerPhone — strip non-digits, enforce 254XXXXXXXXX
    const normalizePhone = (p) => {
      const digits = p.replace(/\D/g, '');
      if (digits.startsWith('254') && digits.length === 12) return digits;
      if (digits.startsWith('0')   && digits.length === 10) return '254' + digits.slice(1);
      if (digits.length === 9)                               return '254' + digits;
      return null;
    };
    const sellerPhone = normalizePhone(rawSellerPhone);
    if (!sellerPhone) {
      return res.status(400).json({ success: false, message: 'Invalid seller phone number' });
    }
    const buyerId = req.user.userId

    const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { phone: true } })
    if (!buyer) return res.status(404).json({ success: false, message: 'Buyer not found' })

    const amount         = new Decimal(rawAmount).toNearest(1, Decimal.ROUND_HALF_UP)
    const fees           = calcFeesBuyerSide(amount)
    const platformFee    = fees.platformFee
    const sellerReceives = fees.sellerReceives.toFixed(2)

    const acceptanceDeadline = new Date(Date.now() + 60 * 60 * 1000) // 1 hour to accept/reject

    const escrow = await prisma.houseEscrow.create({
      data: {
        buyerId,
        sellerPhone,
        buyerPhone:         buyer.phone,
        serviceType,
        description,
        address:            area,
        amount:             amount.toFixed(2),
        platformFee:        platformFee.toFixed(2),
        sellerReceives,
        inspectionHours:    protectionHours,
        status:             'PENDING_ACCEPTANCE',
        acceptanceDeadline,
      },
    })

    await prisma.houseAuditLog.create({
      data: { escrowId: escrow.id, action: 'CREATED', meta: { buyerId, sellerPhone, serviceType, area, amount: amount.toFixed(2) } },
    })

    // Notify seller a deal is waiting — first contact point in the whole flow, no money moved yet
    try {
      const { notifySeller } = require('../src/services/sellerNotifier')
      await notifySeller({
        phone:         sellerPhone,
        type:          'payment_received',
        messageEn:     `New house deal request: ${description} in ${area}, KES ${amount.toFixed(0)}. Open the app to accept or reject within 1 hour.`,
        registeredSms: `LipaSafe: New house deal request — KES ${amount.toFixed(0)} for "${description}" in ${area}. Open the app to accept or reject within 1 hour.`,
        ghostSms:      `LipaSafe: Someone wants to pay you KES ${amount.toFixed(0)} via escrow for "${description}" in ${area}. View & respond: ${process.env.PUBLIC_BASE_URL || 'https://lipasafe.co.ke'}/house-link/${escrow.id} (expires in 1 hour)`,
        houseEscrowId: escrow.id,
      })
    } catch (notifErr) {
      logger.error('House creation-notify failed', { error: notifErr.message, escrowId: escrow.id })
    }

    logger.info('House escrow created — awaiting seller acceptance', { escrowId: escrow.id, buyerId, acceptanceDeadline })
    return res.status(201).json({ success: true, escrow })
  } catch (err) {
    logger.error('createHouseEscrow failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Get status ─────────────────────────────────────────────────────────────
const getHouseEscrowStatus = async (req, res) => {
  try {
    const { escrowId } = req.params
    const userId       = req.user.userId

    const escrow = await prisma.houseEscrow.findFirst({
      where:   { id: escrowId, deletedAt: null },
      include: { dispute: true },
    })

    if (!escrow) return res.status(404).json({ success: false, message: 'Escrow not found' })

    const requestingUser = await prisma.user.findUnique({
      where:  { id: userId },
      select: { phone: true },
    })

    const isBuyer  = escrow.buyerId     === userId
    const isSeller = escrow.sellerPhone === normalizePhoneLocal(requestingUser?.phone || '')

    if (!isBuyer && !isSeller) return res.status(403).json({ success: false, message: 'Forbidden' })

    return res.json({ success: true, escrow, isBuyer, isSeller })
  } catch (err) {
    logger.error('getHouseEscrowStatus failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


// ── Confirm — release to seller ────────────────────────────────────────────
const confirmHouseEscrow = async (req, res) => {
  try {
    const { escrowId } = req.params
    const buyerId      = req.user.userId

    // Verify ownership first
    const escrow = await prisma.houseEscrow.findUnique({ where: { id: escrowId } })
    if (!escrow)                    return res.status(404).json({ success: false, message: 'Escrow not found' })
    if (escrow.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Forbidden' })

    // Atomic status transition — prevents double-confirm race
    const updated = await prisma.houseEscrow.updateMany({
      where: { id: escrowId, status: 'PAYMENT_HELD' },
      data:  { status: 'CONFIRMED', completedAt: new Date() },
    })
    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: `Cannot confirm — escrow is ${escrow.status}` })
    }

    await prisma.houseAuditLog.create({
      data: { escrowId, action: 'BUYER_CONFIRMED', meta: { buyerId } },
    })

    const houseQueue = require('../src/queues/houseQueue')
    try {
      await houseQueue.add('payout_seller', {
        escrowId,
        sellerPhone:    escrow.sellerPhone,
        sellerReceives: escrow.sellerReceives?.toString() || escrow.amount.toString(),
      }, {
        jobId:   `house-payout-${escrowId}`,
        attempts: 10,
        backoff: { type: 'exponential', delay: 5000 },
      })
      logger.info('House escrow confirmed — payout queued', { escrowId })
    } catch (queueErr) {
      logger.error('CRITICAL: house payout queue failed after CONFIRMED — funds stuck, needs reconciliation', {
        escrowId, error: queueErr.message,
      })
    }

    return res.json({ success: true, message: 'Payment released to seller' })
  } catch (err) {
    logger.error('confirmHouseEscrow failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Dispute ────────────────────────────────────────────────────────────────
const disputeHouseEscrow = async (req, res) => {
  try {
    const { escrowId } = req.params
    const buyerId      = req.user.userId

    const schema = z.object({
      reason:      z.string().min(3),
      description: z.string().min(10),
      buyerPhotos: z.array(z.string()).max(3).default([]),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { reason, description, buyerPhotos } = parsed.data

    // Verify ownership first
    const escrow = await prisma.houseEscrow.findUnique({ where: { id: escrowId } })
    if (!escrow)                    return res.status(404).json({ success: false, message: 'Escrow not found' })
    if (escrow.buyerId !== buyerId) return res.status(403).json({ success: false, message: 'Forbidden' })

    // Atomic status transition — prevents double-dispute race
    const updated = await prisma.houseEscrow.updateMany({
      where: { id: escrowId, status: 'PAYMENT_HELD' },
      data:  { status: 'DISPUTED' },
    })
    if (updated.count === 0) {
      return res.status(400).json({ success: false, message: `Cannot dispute — escrow is ${escrow.status}` })
    }

    await prisma.$transaction([
      prisma.houseDispute.create({
        data: { escrowId, openedBy: buyerId, reason, description, buyerPhotos, status: 'OPEN' },
      }),
      prisma.houseAuditLog.create({
        data: { escrowId, action: 'DISPUTE_OPENED', meta: { buyerId, reason } },
      }),
    ])

    const houseQueue = require('../src/queues/houseQueue')
    if (process.env.ADMIN_PHONE) {
      await houseQueue.add('send_raw_sms', {
        phone:   process.env.ADMIN_PHONE,
        message: `LIPASAFE: House dispute opened. Escrow: ${escrowId.slice(0, 8).toUpperCase()}. Reason: ${reason}. Review required.`,
      })
    }

    logger.info('House dispute opened', { escrowId, buyerId, reason })
    // ── Notify buyer ──
    await createAndSend({
      userId:       buyerId,
      type:         'dispute_opened',
      messageEn:    `Your dispute is open. KES ${escrow.amount} is frozen until admin resolves.`,
      houseEscrowId: escrowId,
    }).catch(() => {})
    // ── Notify seller if registered ──
    const sellerUser = await prisma.user.findFirst({ where: { phone: escrow.sellerPhone }, select: { id: true } })
    if (sellerUser) {
      await createAndSend({
        userId:       sellerUser.id,
        type:         'dispute_opened',
        messageEn:    `A buyer has disputed your house deal. KES ${escrow.amount} is frozen pending admin review.`,
        houseEscrowId: escrowId,
      }).catch(() => {})
    }
    return res.status(201).json({ success: true, message: 'Dispute opened — funds frozen' })
  } catch (err) {
    logger.error('disputeHouseEscrow failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── List buyer's escrows ───────────────────────────────────────────────────
const getMyHouseEscrows = async (req, res) => {
  try {
    const buyerId = req.user.userId

    const escrows = await prisma.houseEscrow.findMany({
      where:   { buyerId, deletedAt: null },
      include: { dispute: { select: { status: true, reason: true, decision: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({ success: true, escrows })
  } catch (err) {
    logger.error('getMyHouseEscrows failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── List escrows where logged-in user is the seller ───────────────────────
const getSellerHouseEscrows = async (req, res) => {
  try {
    const userId = req.user.userId
    const user   = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    // sellerPhone is always stored normalized (254XXXXXXXXX) at creation time
    
    const normalizedPhone = normalizePhoneLocal(user.phone)
    if (!normalizedPhone) return res.status(400).json({ success: false, message: 'Invalid phone on account' })

    const escrows = await prisma.houseEscrow.findMany({
      where:   {
        sellerPhone: normalizedPhone,
        status:      { in: ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PAYMENT_HELD', 'DISPUTED', 'ESCALATED'] },
        deletedAt:   null,
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.json({ success: true, escrows })
  } catch (err) {
    logger.error('getSellerHouseEscrows failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


const deleteHouseEscrow = async (req, res) => {
  try {
    const { id } = req.params;   
    const userId  = req.user.userId;
    const escrow  = await prisma.houseEscrow.findUnique({ where: { id }, select: { buyerId: true, status: true, deletedAt: true } });
    if (!escrow)                    return res.status(404).json({ success: false, message: 'Escrow not found' });
    if (escrow.buyerId !== userId)  return res.status(403).json({ success: false, message: 'Not authorized' });
    const moneyHeld = ['PAYMENT_INITIATING','PAYMENT_HELD','DISPUTED','ESCALATED']
    if (moneyHeld.includes(escrow.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete — funds are actively held in this escrow' })
    }
    await prisma.houseEscrow.update({ where: { id }, data: { deletedAt: new Date() } });
    return res.json({ success: true, message: 'Escrow deleted' });
  } catch (err) {
    logger.error('deleteHouseEscrow error', { err: err.message });
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};


const getHouseDisputes = async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit)  || 20, 1), 100)
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)
    const status = req.query.status || undefined

    const where = status ? { status } : {}

    const [disputes, total] = await Promise.all([
      prisma.houseDispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    limit,
        skip:    offset,
        include: {
          escrow: {
            select: {
              id:      true,
              amount:  true,
              buyerId: true,
              status:  true,
            },
          },
        },
      }),
      prisma.houseDispute.count({ where }),
    ])

    return res.json({ success: true, disputes, total })
  } catch (err) {
    logger.error('getHouseDisputes failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}


const resolveHouseDispute = async (req, res) => {
  try {
    const { disputeId } = req.params
    const { action: rawAction, note } = req.body
    const action = rawAction === 'Refund Buyer'     ? 'REFUND'
                 : rawAction === 'Release to Seller' ? 'RELEASE'
                 : (rawAction || '').toUpperCase()
    const adminId = req.user.userId

    if (!action) return res.status(400).json({ success: false, message: 'Missing action.' })
    if (!['REFUND', 'RELEASE'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be REFUND or RELEASE.' })
    }

    // Atomic lock — prevents two admins resolving simultaneously and double-paying
    const locked = await prisma.houseDispute.updateMany({
      where: { id: disputeId, status: { not: 'RESOLVED' } },
      data:  { status: 'RESOLVED' },
    })
    if (locked.count === 0)
      return res.status(400).json({ success: false, message: 'Dispute already resolved.' })

    // Fetch full data after lock secured
    const dispute = await prisma.houseDispute.findUnique({
      where:   { id: disputeId },
      include: { escrow: true },
    })

    const escrow = dispute.escrow
    if (!escrow) return res.status(400).json({ success: false, message: 'Escrow not found.' })

    const houseQueue = require('../src/queues/houseQueue')
    const Decimal    = require('decimal.js')

    if (action === 'REFUND') {
      // Platform fee non-refundable
      const total      = new Decimal(escrow.amount)
      const fee        = new Decimal(escrow.platformFee || 0)
      const refundAmt  = total.minus(fee)
      if (refundAmt.lte(0)) return res.status(400).json({ success: false, message: 'Invalid refund amount.' })

      // escrow.status stays DISPUTED — only houseB2cResult (on real B2C success)
      // is allowed to set REFUNDED. Prevents "REFUNDED" being shown when the
      // payout actually failed/escalated.
      await prisma.$transaction([
        prisma.houseDispute.update({
          where: { id: disputeId },
          data:  { status: 'RESOLVED', decision: 'FULL_REFUND', adminNotes: note || null, resolvedAt: new Date() },
        }),
        prisma.houseAuditLog.create({
          data: { escrowId: escrow.id, action: 'DISPUTE_RESOLVED_REFUND', meta: { adminId, note, refundAmt: refundAmt.toString() } },
        }),
      ])

      try {
        await houseQueue.add('refund_buyer', {
          escrowId: escrow.id,
          buyerId:  escrow.buyerId,
          amount:   refundAmt.toString(),
        }, { jobId: `dispute-refund-${disputeId}` })
        logger.info('House dispute resolved — refund queued', { disputeId, escrowId: escrow.id, refundAmt: refundAmt.toString() })
      } catch (queueErr) {
        logger.error('CRITICAL: dispute refund queue failed after RESOLVED — funds stuck, needs reconciliation', {
          disputeId, escrowId: escrow.id, error: queueErr.message,
        })
      return res.status(500).json({ success: false, message: 'Dispute marked resolved but payout failed to queue — contact engineering' })
      }

      // ── Notify both parties — refund ──
      await Promise.allSettled([
        createAndSend({
          userId:       escrow.buyerId,
          type:         'dispute_resolved',
          messageEn:    `Dispute resolved in your favor. KES ${refundAmt.toString()} refund is being processed to your M-Pesa.`,
          houseEscrowId: escrow.id,
        }),
        prisma.user.findFirst({ where: { phone: escrow.sellerPhone }, select: { id: true } })
          .then(s => s && createAndSend({
            userId:       s.id,
            type:         'dispute_resolved',
            messageEn:    `Dispute on your house deal was resolved in the buyer's favor. KES ${refundAmt.toString()} refunded to buyer.`,
            houseEscrowId: escrow.id,
          })),
      ])
      return res.json({ success: true, resolution: 'REFUND', refundAmt: refundAmt.toString() })

    } else {
      // RELEASE — pay seller sellerReceives
      const releaseAmt = new Decimal(escrow.sellerReceives || escrow.amount)

      // escrow.status stays DISPUTED — only houseB2cResult (on real B2C success)
      // is allowed to set COMPLETED. Prevents "COMPLETED" being shown when the
      // payout actually failed/escalated.
      await prisma.$transaction([
        prisma.houseDispute.update({
          where: { id: disputeId },
          data:  { status: 'RESOLVED', decision: 'FULL_RELEASE', adminNotes: note || null, resolvedAt: new Date() },
        }),
        prisma.houseAuditLog.create({
          data: { escrowId: escrow.id, action: 'DISPUTE_RESOLVED_RELEASE', meta: { adminId, note, releaseAmt: releaseAmt.toString() } },
        }),
      ])

      try {
        await houseQueue.add('payout_seller', {
          escrowId:       escrow.id,
          sellerPhone:    escrow.sellerPhone,
          sellerReceives: releaseAmt.toString(),
        }, { jobId: `dispute-release-${disputeId}` })
        logger.info('House dispute resolved — payout queued', { disputeId, escrowId: escrow.id, releaseAmt: releaseAmt.toString() })
      } catch (queueErr) {
        logger.error('CRITICAL: dispute release queue failed after RESOLVED — funds stuck, needs reconciliation', {
          disputeId, escrowId: escrow.id, error: queueErr.message,
        })
      return res.status(500).json({ success: false, message: 'Dispute marked resolved but payout failed to queue — contact engineering' })
      }

      // ── Notify both parties — release ──
      await Promise.allSettled([
        createAndSend({
          userId:       escrow.buyerId,
          type:         'dispute_resolved',
          messageEn:    `Dispute resolved. Funds of KES ${releaseAmt.toString()} have been released to the seller.`,
          houseEscrowId: escrow.id,
        }),
        prisma.user.findFirst({ where: { phone: escrow.sellerPhone }, select: { id: true } })
          .then(s => s && createAndSend({
            userId:       s.id,
            type:         'dispute_resolved',
            messageEn:    `Dispute resolved in your favor. KES ${releaseAmt.toString()} is being sent to your M-Pesa.`,
            houseEscrowId: escrow.id,
          })),
      ])
      return res.json({ success: true, resolution: 'RELEASE', releaseAmt: releaseAmt.toString() })
    }
  } catch (err) {
    logger.error('resolveHouseDispute failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error.' })
  }
}

// ── Public seller link page data (ghost sellers, no login) ────────────────
const getHouseLinkEscrow = async (req, res) => {
  try {
    const { escrowId } = req.params
    const { maskPhone } = require('../src/utils/maskPhone')

    const escrow = await prisma.houseEscrow.findFirst({
      where: { id: escrowId, deletedAt: null },
    })
    if (!escrow) return res.status(404).json({ success: false, message: 'Escrow not found' })

    await prisma.houseAuditLog.create({
      data: { escrowId: escrow.id, action: 'LINK_OPENED', meta: { ip: req.ip } },
    })

    return res.json({
      success: true,
      escrowId:           escrow.id,
      status:              escrow.status,
      amount:              escrow.amount,
      description:         escrow.description,
      address:             escrow.address,
      inspectionHours:     escrow.inspectionHours,
      inspectionDeadline:  escrow.inspectionDeadline,
      buyerMasked:         maskPhone(escrow.buyerPhone),
    })
  } catch (err) {
    logger.error('getHouseLinkEscrow failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Seller accept/reject (shared core) ──────────────────────────────────────
const redis = require('../src/utils/redis')
const { createAndSend } = require('../src/services/notificationService')

const normalizePhoneLocal = (p) => {
  const digits = (p || '').replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return digits
  if (digits.startsWith('0')   && digits.length === 10) return '254' + digits.slice(1)
  if (digits.length === 9)                               return '254' + digits
  return null
}

const processHouseDealResponse = async ({ escrowId, decision, reason = null, verifiedSellerPhone }) => {
  // decision: 'ACCEPTED' | 'REJECTED'
  const escrow = await prisma.houseEscrow.findUnique({ where: { id: escrowId } })
  if (!escrow) return { status: 404, body: { success: false, message: 'Escrow not found' } }

  if (verifiedSellerPhone !== escrow.sellerPhone) {
    return { status: 403, body: { success: false, message: 'Not your deal' } }
  }

  if (escrow.acceptanceDeadline && escrow.acceptanceDeadline < new Date()) {
    return { status: 400, body: { success: false, message: 'Acceptance window has expired' } }
  }

  const updated = await prisma.houseEscrow.updateMany({
    where: { id: escrowId, status: 'PENDING_ACCEPTANCE' },
    data:  { status: decision },
  })
  if (updated.count === 0) {
    return { status: 400, body: { success: false, message: 'Deal already responded to or expired' } }
  }

  await prisma.houseAuditLog.create({
    data: { escrowId, action: decision, meta: { reason: reason || undefined } },
  })

  const buyer = await prisma.user.findUnique({ where: { id: escrow.buyerId }, select: { phone: true } })
  try {
    const smsQueue = require('../src/queues/smsQueue')
    await smsQueue.add('buyer_notify_deal_response', {
      type:    'raw',
      phone:   buyer?.phone,
      message: decision === 'ACCEPTED'
        ? `LipaSafe: Seller accepted your house deal "${escrow.description}". Open the app to pay and start escrow.`
        : `LipaSafe: Seller declined your house deal "${escrow.description}".${reason ? ' Reason: ' + reason : ''}`,
    })
  } catch (smsErr) {
    logger.error('processHouseDealResponse: buyer SMS failed', { escrowId, error: smsErr.message })
  }

  try {
    await createAndSend({
      userId: escrow.buyerId,
      type: decision === 'ACCEPTED' ? 'house_deal_accepted' : 'house_deal_rejected',
      houseEscrowId: escrowId,
      messageEn: decision === 'ACCEPTED'
        ? `Seller accepted your house deal "${escrow.description}". You can now pay.`
        : `Seller declined your house deal "${escrow.description}".${reason ? ' Reason: ' + reason : ''}`,
    })
  } catch (notifErr) {
    logger.error('processHouseDealResponse: socket notify failed', { escrowId, error: notifErr.message })
  }

  logger.info(`House deal ${decision.toLowerCase()}`, { escrowId })
  return {
    status: 200,
    body: { success: true, message: decision === 'ACCEPTED' ? 'Deal accepted. Buyer notified to pay.' : 'Deal rejected. Buyer notified.' },
  }
}

// ── In-app (authenticated) ───────────────────────────────────────────────────
const acceptHouseDealAuth = async (req, res) => {
  try {
    const { escrowId } = req.params
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    const result = await processHouseDealResponse({
      escrowId,
      decision: 'ACCEPTED',
      verifiedSellerPhone: normalizePhoneLocal(user.phone),
    })
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('acceptHouseDealAuth failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const rejectHouseDealAuth = async (req, res) => {
  try {
    const { escrowId } = req.params
    const userId = req.user.userId
    const { reason } = req.body
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    const result = await processHouseDealResponse({
      escrowId,
      decision: 'REJECTED',
      reason,
      verifiedSellerPhone: normalizePhoneLocal(user.phone),
    })
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('rejectHouseDealAuth failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

// ── Public link (ghost seller, no auth) — rate-limited + phone-confirmed ────
const checkHouseLinkRateLimit = async (escrowId, res) => {
  const rateLimitKey = `ratelimit:houselink:${escrowId}`
  const attempts = await redis.incr(rateLimitKey)
  if (attempts === 1) await redis.expire(rateLimitKey, 3600)
  if (attempts > 5) {
    res.status(429).json({ success: false, message: 'Too many attempts on this link. Try again later.' })
    return false
  }
  return true
}

const acceptHouseDealPublic = async (req, res) => {
  try {
    const { escrowId } = req.params
    if (!(await checkHouseLinkRateLimit(escrowId, res))) return

    const phone = normalizePhoneLocal(req.body.phone)
    if (!phone) return res.status(400).json({ success: false, message: 'Valid phone number required to confirm this deal' })

    const result = await processHouseDealResponse({ escrowId, decision: 'ACCEPTED', verifiedSellerPhone: phone })
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('acceptHouseDealPublic failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const rejectHouseDealPublic = async (req, res) => {
  try {
    const { escrowId } = req.params
    if (!(await checkHouseLinkRateLimit(escrowId, res))) return

    const phone = normalizePhoneLocal(req.body.phone)
    if (!phone) return res.status(400).json({ success: false, message: 'Valid phone number required to confirm this deal' })

    const result = await processHouseDealResponse({ escrowId, decision: 'REJECTED', reason: req.body.reason, verifiedSellerPhone: phone })
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('rejectHouseDealPublic failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

module.exports = { createHouseEscrow, getHouseDisputes, resolveHouseDispute, getHouseEscrowStatus, confirmHouseEscrow, disputeHouseEscrow, getMyHouseEscrows, getSellerHouseEscrows,
  deleteHouseEscrow, getHouseLinkEscrow,
  acceptHouseDealAuth, rejectHouseDealAuth, acceptHouseDealPublic, rejectHouseDealPublic,
}
