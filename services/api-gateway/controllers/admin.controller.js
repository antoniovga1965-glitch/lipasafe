'use strict'
const prisma = require('../src/utils/prisma')
const { logAudit } = require('../src/utils/auditLog')
const { releaseToSeller, refundBuyer: secondHandRefund, partialRefund } = require('../src/services/secondHandService')
const { releaseFunds: bundleRelease, refundBuyer: bundleRefund } = require('../src/services/bundleService')
const logger = require('../src/middleware/layer1-gate/httpLogger')
const stub = (req, res) => res.json({ success: true, data: [] });

// ── DASHBOARD STATS ──────────────────────────────────────────────────────────
async function getDashboardStats(req, res) {
  try {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [
      totalUsers, activeUsers, suspendedUsers, verifiedUsers,
      heldTxs, disputedTxs,
      secondHandActive,
      openDisputes,
      recentTxs,
      revenueData,
      fundiHeld, deliveryHeld, houseHeld, customHeld,
      recentFundi, recentDelivery, recentHouse, recentCustom, recentOrders, orderHeld,
      pendingKycCount, rejectedKycCount,
      walletHeld, protectedTransferHeld,
      recentWalletTx, recentProtectedTransfer,
      orderRevenueData, revenueThisMonthData,
      processedTx, processedFundi, processedDelivery,
      processedHouse, processedCustom, processedOrder, processedWallet,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { accountStatus: 'active' } }),
      prisma.user.count({ where: { accountStatus: 'suspended' } }),
      prisma.user.count({ where: { kycStatus: 'verified' } }),
      prisma.transaction.aggregate({ where: { state: 'held' }, _count: true, _sum: { amount: true } }),
      prisma.transaction.count({ where: { state: 'disputed' } }),
      prisma.secondHandListing.count({ where: { status: 'active' } }),
      Promise.all([
        prisma.dispute.count({ where: { status: { in: ['open', 'under_review', 'escalated'] } } }),
        prisma.fundiDispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } } }),
        prisma.deliveryDispute.count({ where: { status: { in: ['OPEN', 'PENDING_ADMIN', 'ESCALATED'] } } }),
        prisma.houseDispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } } }),
        prisma.customDispute.count({ where: { status: { not: 'RESOLVED' } } }),
        prisma.orderDispute.count({ where: { resolvedAt: null } }),
      ]).then(counts => counts.reduce((a, b) => a + b, 0)),
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { buyer: { select: { fullName: true, phone: true } }, seller: { select: { fullName: true, phone: true } } },
      }),
      prisma.user.findUnique({
        where: { email: 'platform@lipasafe.co.ke' },
        select: { wallet: { select: { availableBalance: true } } },
      }),
      prisma.fundiEscrow.aggregate({ where: { status: 'held' }, _count: true, _sum: { amount: true } }),
      prisma.deliveryEscrow.aggregate({ where: { status: 'held' }, _count: true, _sum: { amount: true } }),
      prisma.houseEscrow.aggregate({ where: { status: 'PAYMENT_HELD' }, _count: true, _sum: { amount: true } }),
      prisma.customEscrow.aggregate({ where: { status: 'PAYMENT_HELD' }, _count: true, _sum: { amount: true } }),
      prisma.fundiJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, amount: true, status: true, createdAt: true, buyerPhone: true, fundiPhone: true } }),
      prisma.deliveryOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, amount: true, status: true, createdAt: true, deliveryGuyPhone: true } }),
      prisma.houseEscrow.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, amount: true, status: true, createdAt: true, sellerPhone: true } }),
      prisma.customEscrow.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, amount: true, status: true, createdAt: true, counterpartyPhone: true } }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, reference: true, amount: true, platformFee: true, state: true, createdAt: true, sellerPhone: true } }),
      prisma.order.aggregate({ where: { state: 'HELD' }, _count: true, _sum: { amount: true } }),
      prisma.user.count({ where: { kycStatus: 'pending' } }),
      prisma.user.count({ where: { kycStatus: 'rejected' } }),
      prisma.walletTransaction.aggregate({ where: { type: 'send', status: 'pending' }, _count: true, _sum: { amount: true } }),
      prisma.protectedTransfer.aggregate({ where: { state: 'PENDING' }, _count: true, _sum: { amount: true } }),
      prisma.walletTransaction.findMany({
        where: { type: 'send' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, reference: true, amount: true, status: true, createdAt: true, fee: true, note: true },
      }),
      prisma.protectedTransfer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, recipientPhone: true, amount: true, state: true, createdAt: true },
      }),
      prisma.order.aggregate({ where: { state: { in: ['RELEASED', 'AUTO_RELEASED'] } }, _sum: { platformFee: true } }),
      prisma.walletTransaction.aggregate({ where: { type: 'platform_fee', status: 'completed', createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { state: { notIn: ['initiated','cancelled'] } }, _sum: { amount: true } }),
      prisma.fundiJob.aggregate({ where: { status: { notIn: ['PENDING_PAYMENT','CANCELLED'] } }, _sum: { amount: true } }),
      prisma.deliveryOrder.aggregate({ where: { status: { notIn: ['PENDING_PHOTO_UPLOAD','CANCELLED'] } }, _sum: { amount: true } }),
      prisma.houseEscrow.aggregate({ where: { status: { notIn: ['PENDING','CANCELLED'] } }, _sum: { amount: true } }),
      prisma.customEscrow.aggregate({ where: { status: { notIn: ['PENDING','CANCELLED'] } }, _sum: { amount: true } }),
      prisma.order.aggregate({ where: { state: { notIn: ['PENDING','CANCELLED'] } }, _sum: { amount: true } }),
      prisma.walletTransaction.aggregate({ where: { type: 'send' }, _sum: { amount: true } }),
    ])

    const mergedRecent = [
      ...recentTxs.map(t => ({
        id: t.id, referenceNo: t.referenceNo, amount: Number(t.amount),
        category: t.category, state: t.state, createdAt: t.createdAt,
      })),
      ...recentFundi.map(j => ({
        id: j.id, referenceNo: j.id, amount: Number(j.amount),
        category: 'fundi', state: j.status, createdAt: j.createdAt,
      })),
      ...recentDelivery.map(o => ({
        id: o.id, referenceNo: o.id, amount: Number(o.amount),
        category: 'delivery', state: o.status, createdAt: o.createdAt,
      })),
      ...recentHouse.map(h => ({
        id: h.id, referenceNo: h.id, amount: Number(h.amount),
        category: 'house', state: h.status, createdAt: h.createdAt,
      })),
      ...recentCustom.map(c => ({
        id: c.id, referenceNo: c.id, amount: Number(c.amount),
        category: 'custom', state: c.status, createdAt: c.createdAt,
      })),
      ...recentOrders.map(o => ({
        id: o.id, referenceNo: o.reference, amount: Number(o.amount),
        category: 'order', state: o.state, createdAt: o.createdAt,
      })),
    ].concat(
      recentWalletTx.map(w => ({
        id: w.id, referenceNo: w.reference, amount: Number(w.amount),
        category: 'wallet_send', state: w.status, createdAt: w.createdAt,
      })),
      recentProtectedTransfer.map(p => ({
        id: p.id, referenceNo: p.id, amount: Number(p.amount),
        category: 'protected_transfer', state: p.state, createdAt: p.createdAt,
      }))
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10)

    const heldEscrowCount = heldTxs._count + fundiHeld._count + deliveryHeld._count + houseHeld._count + customHeld._count + orderHeld._count + walletHeld._count + protectedTransferHeld._count
    const heldEscrowAmount = Number(heldTxs._sum.amount || 0) + Number(fundiHeld._sum.amount || 0) + Number(deliveryHeld._sum.amount || 0) + Number(houseHeld._sum.amount || 0) + Number(customHeld._sum.amount || 0) + Number(orderHeld._sum.amount || 0) + Number(walletHeld._sum.amount || 0) + Number(protectedTransferHeld._sum.amount || 0)

    const totalProcessed =
      Number(processedTx?._sum?.amount || 0) +
      Number(processedFundi?._sum?.amount || 0) +
      Number(processedDelivery?._sum?.amount || 0) +
      Number(processedHouse?._sum?.amount || 0) +
      Number(processedCustom?._sum?.amount || 0) +
      Number(processedOrder?._sum?.amount || 0) +
      Number(processedWallet?._sum?.amount || 0)

    res.json({
      success: true,
      stats: {
        totalUsers, activeUsers, suspendedUsers, verifiedUsers,
        pendingKyc: pendingKycCount, rejectedKyc: rejectedKycCount,
        heldEscrowCount,
        heldEscrowAmount,
        disputedTxs,
        secondHandActive,
        openDisputes,
        orderRevenue: Number(orderRevenueData?._sum?.platformFee || 0),
        totalRevenue: Number(revenueData?.wallet?.availableBalance || 0),
        revenueThisMonth: Number(revenueThisMonthData?._sum?.amount || 0),
        totalProcessed,
      },
      recentTxs: mergedRecent,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ── GET ALL DISPUTES (all 5 services normalized) ─────────────────────────────
async function getDisputes(req, res) {
  try {
    const [
      genericDisputes,
      fundiDisputes,
      deliveryDisputes,
      houseDisputes,
       orderDisputes,
      customDisputes
    ] = await Promise.all([
      prisma.dispute.findMany({
        orderBy: { openedAt: 'desc' },
        include: {
          transaction: { select: { id: true, referenceNo: true, amount: true, category: true, buyer: { select: { fullName: true, phone: true } }, seller: { select: { fullName: true, phone: true } } } },
          opener: { select: { fullName: true, phone: true } },
        }
      }),
      // Fundi
      prisma.fundiDispute.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          job: { select: { id: true, amount: true, fundiPhone: true, buyerPhone: true } },
          opener: { select: { fullName: true, phone: true } },
        }
      }),
      // Delivery
      prisma.deliveryDispute.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, orderId: true, claimerType: true, reason: true,
          claimDescription: true, status: true, resolution: true,
          adminNotes: true, resolvedAt: true, createdAt: true,
          cvAnalysisReport: true,
          order: {
            select: {
              id: true, amount: true, goods: true, deliveryGuyPhone: true,
              buyer: { select: { fullName: true, phone: true } },
              photos: { select: { photoType: true, cloudinaryUrl: true } },
            }
          },
        }
      }),
      // House
      prisma.houseDispute.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          escrow: { select: { id: true, amount: true, description: true, buyer: { select: { fullName: true, phone: true } }, sellerPhone: true } },
        }
      }),
      // Order disputes
      prisma.orderDispute.findMany({
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { reference: true, amount: true, sellerPhone: true, buyer: { select: { fullName: true, phone: true } } } } },
      }),
      // Custom
      prisma.customDispute.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          escrow: { select: { id: true, amount: true, counterpartyReceives: true, title: true, buyer: { select: { fullName: true, phone: true } }, counterpartyPhone: true } },
        }
      }),
    ])

    // Normalize all into one shape
    const normalize = () => [
      ...genericDisputes.map(d => ({
        id: d.id, service: d.transaction?.category || 'bundles',
        referenceNo: d.transaction?.referenceNo,
        amount: Number(d.transaction?.amount || 0),
        reason: d.reason, description: d.description,
        status: d.status, openedAt: d.openedAt,
        buyer: d.transaction?.buyer, seller: d.transaction?.seller,
        opener: d.opener, buyerEvidence: d.buyerEvidence, sellerEvidence: d.sellerEvidence,
        resolutionNote: d.resolutionNote, resolutionAction: d.resolutionAction,
        _raw: 'generic', _id: d.id,
      })),
      ...fundiDisputes.map(d => ({
        id: d.id, service: 'fundi',
        referenceNo: d.job?.id,
        amount: Number(d.job?.amount || 0),
        reason: d.reason, description: d.description,
        status: (d.status || '').toLowerCase(), openedAt: d.createdAt,
        buyer: d.opener, seller: { fullName: 'Fundi', phone: d.job?.fundiPhone },
        opener: d.opener, buyerEvidence: { photos: d.evidencePhotos }, sellerEvidence: { photos: d.job?.afterPhotos || [] },
        resolutionNote: null, resolutionAction: d.decision,
        _raw: 'fundi', _id: d.id, jobId: d.job?.id,
      })),
      ...deliveryDisputes.map(d => {
        let cvReport = null
        try { cvReport = d.cvAnalysisReport ? JSON.parse(d.cvAnalysisReport) : null } catch {}
        return {
          id: d.id, service: 'delivery',
          referenceNo: d.orderId,
          amount: Number(d.order?.amount || 0),
          reason: d.reason, description: d.claimDescription,
          status: (d.status || '').toLowerCase(), openedAt: d.createdAt,
          buyer: d.order?.buyer, seller: { fullName: 'Delivery Guy', phone: d.order?.deliveryGuyPhone },
          opener: d.order?.buyer, buyerEvidence: null, sellerEvidence: null,
          resolutionNote: d.adminNotes, resolutionAction: d.resolution,
          cvReport,
          llmConfidence: cvReport?.confidence || 0,
          buyerEvidence: {
            photos: (d.order?.photos || []).filter(p => p.photoType === 'BEFORE').map(p => p.cloudinaryUrl),
          },
          sellerEvidence: {
            photos: (d.order?.photos || []).filter(p => ['DURING','AFTER'].includes(p.photoType)).map(p => p.cloudinaryUrl),
            notes: `Delivery Guy: ${d.order?.deliveryGuyPhone || ''}`,
          },
          _raw: 'delivery', _id: d.id,
        }
      }),
      ...houseDisputes.map(d => ({
        id: d.id, service: 'house',
        referenceNo: d.escrowId,
        amount: Number(d.escrow?.amount || 0),
        reason: d.reason, description: d.description,
        status: (d.status || '').toLowerCase(), openedAt: d.createdAt,
        buyer: d.escrow?.buyer, seller: { fullName: 'Seller', phone: d.escrow?.sellerPhone },
        opener: d.escrow?.buyer, buyerEvidence: { photos: d.buyerPhotos }, sellerEvidence: null,
        resolutionNote: d.adminNotes, resolutionAction: d.decision,
        _raw: 'house', _id: d.id,
      })),
      ...orderDisputes.map(d => ({
        id: d.id, _disputeId: d.id, _raw: 'order',
        service: 'order', serviceType: 'Order',
        referenceNo: d.order?.reference,
        amount: Number(d.order?.amount || 0),
        reason: d.reason,
        status: d.resolution ? 'RESOLVED' : 'OPEN',
        createdAt: d.createdAt,
        buyer: d.order?.buyer,
        seller: { fullName: 'Seller', phone: d.order?.sellerPhone || '' },
        buyerEvidence: { notes: d.buyerNote },
        sellerEvidence: { notes: d.sellerNote, url: d.sellerEvidenceUrl },
      })),
      ...customDisputes.map(d => ({
        id: d.id, service: 'custom',
        referenceNo: d.escrowId,
        amount: Number(d.escrow?.amount || 0),
        reason: d.reason, description: d.description,
        status: (d.status || '').toLowerCase(), openedAt: d.createdAt,
        buyer: d.escrow?.buyer, seller: { fullName: 'Counterparty', phone: d.escrow?.counterpartyPhone },
        opener: d.escrow?.buyer, buyerEvidence: { files: d.evidence }, sellerEvidence: { notes: d.sellerResponse, files: d.sellerEvidence },
        netAmount: Number(d.escrow?.counterpartyReceives || 0),
        resolutionNote: null, resolutionAction: d.resolution,
        _raw: 'custom', _id: d.escrowId, _disputeId: d.id,
      })),
    ]

    const all = normalize().sort((a, b) => new Date(b.openedAt || b.createdAt) - new Date(a.openedAt || a.createdAt))

   return res.json({ success: true, disputes: all, total: all.length })
  } catch (err) {
    console.error(err)
     return res.status(500).json({ success: false, message: err.message })
  }
}

// ── RESOLVE DISPUTE ─────────────────────────────────────────────────────────
// Routes to correct service based on transaction category.
// Bundle = bundleService. Everything else = secondHandService (generic dispute table).
const { adminResolveDispute: _customResolve } = require('./customEscrow.controller')
const { resolveDispute: resolveDeliveryDisputeSvc } = require('../src/services/disputeService')

async function resolveDispute(req, res) {
  const { id } = req.params
  const { action, note } = req.body

  try {
    // ── Route delivery disputes to their own service ──
    if (req.body.service === 'delivery') {
      const actionMap = {
        'refund_buyer':      'REFUND',
        'Refund Buyer':      'REFUND',
        'release_seller':    'PAY',
        'Release to Seller': 'PAY',
      }
      const resolution = actionMap[req.body.action]
      if (!resolution) return res.status(400).json({ success: false, message: 'Invalid action for delivery dispute' })
      const result = await resolveDeliveryDisputeSvc({
        disputeId:  id,
        resolution,
        adminNotes: req.body.note || '',
        adminId:    req.user.userId,
      })
      if (result?.success) {
        await logAudit({
          actorId: req.user.userId, actorType: 'admin',
          action: resolution === 'REFUND' ? 'Refunded Buyer' : 'Released Escrow',
          entityType: 'DeliveryDispute', entityId: id,
          newState: { resolution, note: req.body.note || null }, ipAddress: req.ip,
        })
      }
      return res.json(result)
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: { transaction: { select: { id: true, category: true, state: true } } }
    })
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' })
    if (!['open', 'escalated', 'under_review'].includes(dispute.status)) {
      return res.status(409).json({ success: false, message: `Dispute already ${dispute.status} — cannot re-resolve` })
    }

    const txId    = dispute.transactionId
    const isBundle = dispute.transaction?.category === 'bundles'

    if (action === 'refund_buyer' || action === 'Refund Buyer') {
      if (isBundle) {
        await bundleRefund(txId)
      } else {
        await secondHandRefund(txId)
      }
      await prisma.dispute.update({
        where: { id },
        data: {
          status: 'resolved_buyer', resolutionAction: 'full_refund',
          resolutionNote: note, resolvedBy: req.user.userId, resolvedAt: new Date()
        }
      })
      await logAudit({
        actorId: req.user.userId, actorType: 'admin', action: 'Refunded Buyer',
        entityType: 'Dispute', entityId: id,
        previousState: { status: dispute.status }, newState: { status: 'resolved_buyer', note },
        ipAddress: req.ip,
      })
      return res.json({ success: true, message: 'Buyer refunded' })
    }

    if (action === 'release_seller' || action === 'Release to Seller') {
      if (isBundle) {
        // Atomically move disputed → held only if still disputed — prevents race on double-click
        const claim = await prisma.transaction.updateMany({
          where: { id: txId, state: { in: ['disputed', 'held', 'confirmed'] } },
          data:  { state: 'held' }
        })
        if (claim.count !== 1) {
          return res.status(409).json({ success: false, message: 'Transaction already being processed or in wrong state' })
        }
        await bundleRelease(txId)
      } else {
        await releaseToSeller(txId, 'admin_decision')
      }
      await prisma.dispute.update({
        where: { id },
        data: {
          status: 'resolved_seller', resolutionAction: 'full_release',
          resolutionNote: note, resolvedBy: req.user.userId, resolvedAt: new Date()
        }
      })
      await logAudit({
        actorId: req.user.userId, actorType: 'admin', action: 'Released Escrow',
        entityType: 'Dispute', entityId: id,
        previousState: { status: dispute.status }, newState: { status: 'resolved_seller', note },
        ipAddress: req.ip,
      })
      return res.json({ success: true, message: 'Funds released to seller' })
    }

    if (action === 'partial_refund' || action === 'Partial Refund') {
      // Bundle service has no partial refund — escalate rather than corrupt state
      if (isBundle) {
        return res.status(400).json({ success: false, message: 'Partial refund not supported for bundle transactions — use full refund or release' })
      }
      await partialRefund(txId, req.user.userId, note)
      await prisma.dispute.update({
        where: { id },
        data: {
          status: 'resolved_partial', resolutionAction: 'partial_refund',
          resolutionNote: note, resolvedBy: req.user.userId, resolvedAt: new Date()
        }
      })
      await logAudit({
        actorId: req.user.userId, actorType: 'admin', action: 'Partial Refund',
        entityType: 'Dispute', entityId: id,
        previousState: { status: dispute.status }, newState: { status: 'resolved_partial', note },
        ipAddress: req.ip,
      })
      return res.json({ success: true, message: 'Partial refund processed — both parties paid' })
    }

    return res.status(400).json({ success: false, message: 'Invalid action' })
  } catch (err) {
    console.error(err)
  return res.status(500).json({ success: false, message: err.message })
  }
}

async function resolveCustomDispute(req, res) {
  // Map admin action strings → custom controller enum + forward to existing handler
  const { action, note, buyerAmount, sellerAmount } = req.body
  const actionMap = {
    'refund_buyer':   'REFUND',
    'Refund Buyer':   'REFUND',
    'release_seller': 'RELEASE',
    'Release to Seller': 'RELEASE',
    'partial_refund': 'PARTIAL',
    'Partial Refund': 'PARTIAL',
  }
  const resolution = actionMap[action]
  if (!resolution) return res.status(400).json({ success: false, message: 'Invalid action' })
  req.params.escrowId = req.params.id
  if (!req.user?.id) return res.status(401).json({ success: false, message: 'Admin identity required' })
  req.body = { resolution, resolvedBy: req.user.id, buyerAmount, sellerAmount }
  const originalJson = res.json.bind(res)
  res.json = (body) => {
    if (body?.success) {
      logAudit({
        actorId: req.user.userId, actorType: 'admin', action: 'Resolved Dispute',
        entityType: 'CustomEscrow', entityId: req.params.escrowId,
        newState: { resolution, buyerAmount, sellerAmount }, ipAddress: req.ip,
      }).catch(() => {})
    }
    return originalJson(body)
  }
  return _customResolve(req, res)
}


// ── Delivery disputes ───────────────────────────────────────────────────────
const getDeliveryDisputes = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 20)
    const [disputes, total] = await Promise.all([
      prisma.deliveryDispute.findMany({
        skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { id: true, goods: true, amount: true, buyerId: true, deliveryGuyPhone: true } } },
      }),
      prisma.deliveryDispute.count(),
    ])
    return res.json({ success: true, data: disputes, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('getDeliveryDisputes error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

const resolveDeliveryDispute = async (req, res) => {
  try {
    const { id } = req.params
    const { action: rawAction, note } = req.body
    const actionMap = {
      'refund_buyer':      'REFUND',
      'Refund Buyer':      'REFUND',
      'release_seller':    'RELEASE',
      'Release to Seller': 'RELEASE',
    }
    const resolution = actionMap[rawAction]
    if (!resolution) return res.status(400).json({ success: false, message: 'Invalid action' })

    const result = await resolveDeliveryDisputeSvc({
      disputeId:  id,
      resolution,
      adminNotes: note || null,
      adminId:    req.user.userId,
    })

    if (result?.success) {
      await logAudit({
        actorId: req.user.userId, actorType: 'admin',
        action: resolution === 'REFUND' ? 'Refunded Buyer' : 'Released Escrow',
        entityType: 'DeliveryDispute', entityId: id,
        newState: { resolution, note: note || null }, ipAddress: req.ip,
      })
    }

    return res.json(result)
  } catch (err) {
    console.error('resolveDeliveryDispute error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ── House disputes ──────────────────────────────────────────────────────────
const { resolveHouseDispute: _resolveHouseDispute, getHouseDisputes } = require('./house.controller')

const listHouseDisputes = getHouseDisputes

async function resolveHouseDispute(req, res) {
  req.params.disputeId = req.params.id
  const originalJson = res.json.bind(res)
  res.json = (body) => {
    if (body?.success) {
      logAudit({
        actorId: req.user.userId, actorType: 'admin',
        action: body.resolution === 'REFUND' ? 'Refunded Buyer' : 'Released Escrow',
        entityType: 'HouseDispute', entityId: req.params.id,
        newState: { resolution: body.resolution }, ipAddress: req.ip,
      }).catch(() => {})
    }
    return originalJson(body)
  }
  return _resolveHouseDispute(req, res)
}

// ── Fundi disputes ───────────────────────────────────────────────────────────
const fundiQueue = require('../src/queues/fundiQueue')
const Decimal    = require('decimal.js')

const listFundiDisputes = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 20)
    const [disputes, total] = await Promise.all([
      prisma.fundiDispute.findMany({
        skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          job:    { select: { id: true, description: true, fundiPhone: true, amount: true, beforePhotos: true, afterPhotos: true } },
          opener: { select: { fullName: true, phone: true } },
        },
      }),
      prisma.fundiDispute.count(),
    ])
    return res.json({ success: true, data: disputes, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('listFundiDisputes error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

const resolveFundiDispute = async (req, res) => {
  try {
    const { jobId } = req.params
        if (!jobId || jobId === 'undefined') {
      return res.status(400).json({ success: false, message: 'jobId param is missing or invalid' })
    }

    
    const { action: rawAction, note, refundAmount, releaseAmount } = req.body
    const actionMap = {
      'refund_buyer':      'FULL_REFUND',
      'Refund Buyer':      'FULL_REFUND',
      'release_seller':    'FULL_RELEASE',
      'Release to Seller': 'FULL_RELEASE',
      'partial_refund':    'PARTIAL',
      'Partial Refund':    'PARTIAL',
    }
    const decision = actionMap[rawAction]
    if (!decision) return res.status(400).json({ success: false, message: 'Invalid action' })

    const dispute = await prisma.fundiDispute.findUnique({
      where:   { jobId },
      include: { job: { include: { escrow: true } } },
    })
    console.error(dispute)
    if (!dispute)               return res.status(404).json({ success: false, message: 'Dispute not found' })
    if (dispute.status === 'RESOLVED') return res.status(400).json({ success: false, message: 'Already resolved' })

    const escrow = dispute.job?.escrow
    if (!escrow)                return res.status(400).json({ success: false, message: 'Escrow not found' })

    const escrowAmt = new Decimal(escrow.amount)
    const refundAmt = refundAmount  ? new Decimal(refundAmount)  : escrowAmt
    const releaseAmt = releaseAmount ? new Decimal(releaseAmount) : escrowAmt

    await prisma.$transaction([
      prisma.fundiDispute.update({
        where: { jobId },
        data:  {
          status: 'RESOLVED', decision,
          refundAmount: refundAmt.toDecimalPlaces(2),
          releaseAmount: releaseAmt.toDecimalPlaces(2),
          resolvedAt: new Date(),
        },
      }),
      prisma.fundiEscrow.update({
        where: { jobId },
        data:  { status: decision === 'FULL_REFUND' ? 'refunded' : 'released' },
      }),
    ])

    if (decision === 'FULL_REFUND' || decision === 'PARTIAL') {
      await fundiQueue.add('refund_buyer', {
        jobId, buyerId: dispute.job.buyerId, amount: refundAmt.toString(),
      }, { jobId: `dispute-refund-${dispute.id}` })
    } else {
      await fundiQueue.add('payout_fundi', {
        jobId, fundiPhone: dispute.job.fundiPhone, amount: releaseAmt.toString(),
      }, { jobId: `dispute-release-${dispute.id}` })
    }

    await logAudit({
      actorId: req.user.userId, actorType: 'admin',
      action: decision === 'FULL_REFUND' ? 'Refunded Buyer'
            : decision === 'FULL_RELEASE' ? 'Released Escrow'
            : 'Partial Refund',
      entityType: 'FundiDispute', entityId: dispute.id,
      newState: { decision, note, refundAmt: refundAmt.toString(), releaseAmt: releaseAmt.toString() },
      ipAddress: req.ip,
    })

    return res.json({ success: true, decision })
  } catch (err) {
    console.error('resolveFundiDispute error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ── User status ──────────────────────────────────────────────────────────────
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const valid = ['active', 'suspended', 'frozen', 'banned']
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: `status must be one of: ${valid.join(', ')}` })

    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, accountStatus: true, fullName: true, phone: true },
    })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    await prisma.user.update({
      where: { id },
      data:  { accountStatus: status },
    })

    await logAudit({
      actorId: req.user.userId, actorType: 'admin',
      action: status === 'active'    ? 'Reactivated User'
            : status === 'suspended' ? 'Suspended User'
            : status === 'banned'    ? 'Banned User'
            : 'Froze User',
      entityType: 'User', entityId: id,
      previousState: { accountStatus: user.accountStatus },
      newState:      { accountStatus: status },
      ipAddress: req.ip,
    })

    return res.json({ success: true, message: `User ${status}` })
  } catch (err) {
    console.error('updateUserStatus error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ── Transactions ────────────────────────────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(100, parseInt(req.query.limit) || 20)
    const [txs, fundiJobs, houseEscrows, walletTxs, protectedTransfers, requestMoneyRows] = await Promise.all([
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          buyer:  { select: { fullName: true, phone: true, kycStatus: true } },
          seller: { select: { fullName: true, phone: true, kycStatus: true } },
        },
      }),
      prisma.fundiJob.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: { select: { fullName: true, phone: true, kycStatus: true } },
        },
      }),
      prisma.houseEscrow.findMany({
        orderBy: { createdAt: 'desc' },
        where: { deletedAt: null },
        include: {
          buyer: { select: { fullName: true, phone: true, kycStatus: true } },
        },
      }),
      prisma.walletTransaction.findMany({
        where: { type: 'send' },
        orderBy: { createdAt: 'desc' },
        include: {
          fromWallet: { include: { user: { select: { fullName: true, phone: true, kycStatus: true } } } },
        },
      }),
      prisma.protectedTransfer.findMany({
        orderBy: { createdAt: 'desc' },
        include: { sender: { select: { fullName: true, phone: true, kycStatus: true } } },
      }),
      prisma.requestMoney.findMany({
        orderBy: { createdAt: 'desc' },
        include: { requester: { select: { fullName: true, phone: true, kycStatus: true } } },
      }),
    ])
    const normalizedFundi = fundiJobs.map(j => ({
      id: j.id,
      category: 'fundi',
      description: j.description,
      buyer: j.buyer,
      buyerPhone: j.buyerPhone,
      seller: null,
      sellerPhone: j.fundiPhone,
      amount: j.amount,
      state: j.status,
      createdAt: j.createdAt,
    }))
    const normalizedHouse = houseEscrows.map(h => ({
      id: h.id,
      category: 'house',
      description: h.description,
      buyer: h.buyer,
      buyerPhone: h.buyerPhone,
      seller: null,
      sellerPhone: h.sellerPhone,
      amount: h.amount,
      state: h.status,
      createdAt: h.createdAt,
    }))
    const normalizedWallet = walletTxs.map(w => ({
      id: w.id,
      category: 'wallet_send',
      description: w.note || 'Wallet Send',
      buyer: w.fromWallet?.user || null,
      buyerPhone: w.fromWallet?.user?.phone || null,
      seller: null,
      sellerPhone: null,
      amount: w.amount,
      state: w.status,
      createdAt: w.createdAt,
    }))
    const normalizedProtectedTransfer = protectedTransfers.map(p => ({
      id: p.id,
      category: 'protected_transfer',
      description: `SafeSend to ${p.recipientPhone}`,
      buyer: p.sender || null,
      buyerPhone: p.sender?.phone || null,
      seller: null,
      sellerPhone: p.recipientPhone,
      amount: p.amount,
      state: p.state,
      createdAt: p.createdAt,
    }))
    const normalizedRequestMoney = requestMoneyRows.map(r => ({
      id: r.id,
      category: 'request_money',
      description: `Request Money — ${r.purpose || 'OTHER'}`,
      buyer: r.requester || null,
      buyerPhone: r.requester?.phone || null,
      seller: null,
      sellerPhone: r.recipientPhone,
      amount: r.amount,
      state: r.state,
      createdAt: r.createdAt,
    }))
    const merged = [...txs, ...normalizedFundi, ...normalizedHouse, ...normalizedWallet, ...normalizedProtectedTransfer, ...normalizedRequestMoney].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const total = merged.length
    const txs_paged = merged.slice((page - 1) * limit, page * limit)
    return res.json({ success: true, data: txs_paged, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('getTransactions error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ── Users ────────────────────────────────────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1)
    const limit  = Math.min(100, parseInt(req.query.limit) || 20)
    const status = req.query.status || undefined
    const where  = status ? { accountStatus: status } : {}
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, phone: true, fullName: true,
          accountStatus: true,
          kycStatus: true, createdAt: true,
          wallet: { select: { availableBalance: true } },
          _count: { select: { buyerTransactions: true } },
        },
      }),
      prisma.user.count({ where }),
    ])
    const flat = users.map(u => ({
      ...u,
      walletBalance: u.wallet?.availableBalance ?? null,
      transactions: u._count?.buyerTransactions ?? 0,
      wallet: undefined, _count: undefined,
    }))
    return res.json({ success: true, data: flat, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('getUsers error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

const searchUser = async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.status(400).json({ success: false, message: 'Missing query param q' })
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { phone:    { contains: q, mode: 'insensitive' } },
          { fullName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      select: {
        id: true, phone: true, fullName: true,
        accountStatus: true, kycStatus: true, createdAt: true,
      },
    })
    return res.json({ success: true, data: users })
  } catch (err) {
    console.error('searchUser error', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
}

// ── KYC admin ───────────────────────────────────────────────────────────────
const listPendingKyc = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 12)
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where:   { kycStatus: 'pending' },
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'asc' },
        select: { id: true, phone: true, fullName: true,
          sellerProfile: { select: { idNumber: true, idDocUrl: true, idBackUrl: true, selfieUrl: true, businessName: true, kycSubmittedAt: true } } },
      }),
      prisma.user.count({ where: { kycStatus: 'pending' } }),
    ])
    return res.json({ success: true, data: users, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('listPendingKyc error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}
const getAuditLog = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 12)
    const search = (req.query.search || '').trim()

    const where = search
      ? {
          OR: [
            { action:     { contains: search, mode: 'insensitive' } },
            { entityId:   { contains: search, mode: 'insensitive' } },
            { entityType: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { timestamp: 'desc' },
        include: { actor: { select: { fullName: true, phone: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    return res.json({ success: true, data: logs, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('getAuditLog error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}
const resolveKyc = async (req, res) => {
  try {
    const { id } = req.params
    const { action, reason } = req.body
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ success: false, message: 'action must be approve or reject' })
    const user = await prisma.user.findUnique({ where: { id }, select: { kycStatus: true } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    if (user.kycStatus !== 'pending') return res.status(400).json({ success: false, message: `KYC already ${user.kycStatus}` })
    if (action === 'approve') {
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { kycStatus: 'verified', kycTier: 'verified' } }),
        prisma.sellerProfile.upsert({ where: { userId: id }, update: { kycRejectionReason: null }, create: { userId: id, category: 'fundi', faceVerified: false } }),
      ])
    } else {
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { kycStatus: 'rejected' } }),
        prisma.sellerProfile.upsert({ where: { userId: id }, update: { kycRejectionReason: reason || 'Rejected by admin' }, create: { userId: id, category: 'fundi', faceVerified: false, kycRejectionReason: reason || 'Rejected by admin' } }),
      ])
    }
    await logAudit({
      actorId:       req.user.userId,
      actorType:     'admin',
      action:        action === 'approve' ? 'Approved KYC' : 'Rejected KYC',
      entityType:    'User',
      entityId:      id,
      previousState: { kycStatus: user.kycStatus },
      newState:      { kycStatus: action === 'approve' ? 'verified' : 'rejected', reason: reason || null },
      ipAddress:     req.ip,
    })
    console.info('KYC resolved', { userId: id, action, adminId: req.user.userId })
    return res.json({ success: true, message: action === 'approve' ? 'KYC approved' : 'KYC rejected' })
  } catch (err) {
    console.error('resolveKyc error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

const getMpesaHealth = async (req, res) => {
  const { getToken } = require('../src/utils/mpesaToken')
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const stkGroups = await Promise.all([
      prisma.mpesaTransaction, prisma.fundiMpesaTransaction,
      prisma.deliveryMpesaTransaction, prisma.houseMpesaTransaction,
      prisma.customMpesaTransaction,
    ].map(t => t.groupBy({
      by: ['status'],
      where: { status: { in: ['completed','failed'] }, createdAt: { gte: since } },
      _count: { status: true }
    })))

    let stkSuccess = 0, stkFailed = 0
    for (const g of stkGroups) {
      stkSuccess += g.find(r => r.status === 'completed')?._count?.status ?? 0
      stkFailed  += g.find(r => r.status === 'failed')?._count?.status ?? 0
    }
    const stkTotal = stkSuccess + stkFailed
    const stkRate  = stkTotal > 0 ? +((stkSuccess / stkTotal) * 100).toFixed(1) : null

    const [payoutG, customG, b2bG] = await Promise.all([
      prisma.payout.groupBy({ by:['status'], where:{ status:{ in:['completed','failed'] }, payoutChannel:'b2c', createdAt:{ gte:since } }, _count:{ status:true } }),
      prisma.customB2CTransaction.groupBy({ by:['status'], where:{ status:{ in:['confirmed','failed'] }, createdAt:{ gte:since } }, _count:{ status:true } }),
      prisma.payout.groupBy({ by:['status'], where:{ payoutChannel:'b2b', createdAt:{ gte:since } }, _count:{ status:true } }),
    ])
    const b2cSuccess = (payoutG.find(r=>r.status==='completed')?._count?.status??0) + (customG.find(r=>r.status==='confirmed')?._count?.status??0)
    const b2cFailed  = (payoutG.find(r=>r.status==='failed')?._count?.status??0)   + (customG.find(r=>r.status==='failed')?._count?.status??0)
    const b2cTotal   = b2cSuccess + b2cFailed
    const b2cRate    = b2cTotal > 0 ? +((b2cSuccess / b2cTotal) * 100).toFixed(1) : null
    const b2bSuccess = b2bG.find(r=>r.status==='confirmed')?._count?.status??0
    const b2bFailed  = b2bG.find(r=>r.status==='failed')?._count?.status??0
    const b2bTotal   = b2bSuccess + b2bFailed
    const b2bRate    = b2bTotal > 0 ? +((b2bSuccess / b2bTotal) * 100).toFixed(1) : null

    const recent = await prisma.mpesaTransaction.findMany({
      where: { status:'completed', processedAt:{ not:null }, createdAt:{ gte:since } },
      select: { createdAt:true, processedAt:true },
      orderBy: { createdAt:'desc' }, take: 200
    })
    const avgLatencyMs = recent.length
      ? Math.round(recent.reduce((s,t) => s + (new Date(t.processedAt) - new Date(t.createdAt)), 0) / recent.length)
      : null

    let apiStatus = 'operational', tokenMs = null
    try {
      const t0 = Date.now()
      await getToken()
      tokenMs = Date.now() - t0
      if (tokenMs > 4000) apiStatus = 'degraded'
    } catch { apiStatus = 'down' }

    return res.json({
      status: apiStatus,
      stkPushSuccessRate: stkRate,
      b2cPayoutSuccessRate: b2cRate,
      avgStkLatencyMs: avgLatencyMs,
      tokenLatencyMs: tokenMs,
      stkTotal, b2cTotal, b2bTotal, b2bPayoutSuccessRate: b2bRate, period: '30d'
    })
  } catch (err) {
    console.error('[getMpesaHealth]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch M-Pesa health' })
  }
}


const getMpesaLogs = async (req, res) => {
  try {
    const { type = 'stk' } = req.query
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    if (type === 'stk') {
      const [main, fundi, delivery, house, custom] = await Promise.all([
        prisma.mpesaTransaction.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, checkoutRequestId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
        prisma.fundiMpesaTransaction.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, checkoutRequestId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
        prisma.deliveryMpesaTransaction.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, checkoutRequestId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
        prisma.houseMpesaTransaction.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, checkoutRequestId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
        prisma.customMpesaTransaction.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, checkoutRequestId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
      ])
      const logs = [...main,...fundi,...delivery,...house,...custom]
        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(t => ({ id: t.mpesaRef || t.checkoutRequestId, phone: t.phone, amount: parseFloat(t.amount), reference: t.checkoutRequestId, status: t.status === 'completed' ? 'Success' : 'Failed', errorMessage: t.status !== 'completed' ? (t.resultDesc || null) : null, timestamp: t.createdAt, type: 'STK Push' }))
      return res.json({ success: true, logs })
    } else {
      const [payouts, customB2c] = await Promise.all([
        prisma.payout.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, originatorConversationId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
        prisma.customB2CTransaction.findMany({ where: { status: { not: 'pending' }, createdAt: { gte: since } }, select: { mpesaRef:true, originatorConversationId:true, phone:true, amount:true, status:true, resultDesc:true, createdAt:true }, orderBy: { createdAt:'desc' }, take: 500 }),
      ])
      const logs = [...payouts,...customB2c]
        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(t => ({ id: t.mpesaRef || t.originatorConversationId, phone: t.phone, amount: parseFloat(t.amount), reference: t.originatorConversationId, status: (t.status==='completed'||t.status==='confirmed') ? 'Success' : 'Failed', errorMessage: (t.status!=='completed'&&t.status!=='confirmed') ? (t.resultDesc||null) : null, timestamp: t.createdAt, type: 'B2C Payout' }))
      return res.json({ success: true, logs })
    }
  } catch (err) {
    console.error('[getMpesaLogs]', err)
    return res.status(500).json({ success: false, message: 'Failed to fetch M-Pesa logs' })
  }
}

module.exports = {
  getDashboardStats, getDisputes, resolveDispute, resolveCustomDispute,
  getTransactions, getUsers, updateUserStatus,
  getDeliveryDisputes, resolveDeliveryDispute,
  listFundiDisputes, resolveFundiDispute,
  listHouseDisputes, resolveHouseDispute,
  listPendingKyc, resolveKyc, getAuditLog, searchUser, getMpesaHealth, getMpesaLogs,
};
