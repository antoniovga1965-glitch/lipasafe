'use strict'
const prisma  = require('../utils/prisma')
const logger  = require('../utils/logger')
const { cloudinary } = require('../utils/cloudinary')

const maskPhone = (phone) => {
  if (!phone || phone.length < 6) return 'Buyer'
  return phone.slice(0, 6) + '***' + phone.slice(-2)
}

// ── Seller link page data ───────────────────────────────────────────────────
const getLinkOrder = async (req, res) => {
  try {
    const { ref } = req.params

    const order = await prisma.order.findUnique({
      where:   { reference: ref },
      include: { buyer: { select: { phone: true } } },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

    await prisma.linkSession.create({
      data: {
        orderId:           order.id,
        ip:                req.ip,
        deviceFingerprint: req.headers['user-agent'] || null,
      },
    })

    if (!order.linkOpenedAt) {
      await prisma.order.update({
        where: { id: order.id },
        data:  { linkOpenedAt: new Date() },
      })
      await prisma.orderEvent.create({
        data: { orderId: order.id, action: 'LINK_OPENED', actor: 'seller', metadata: { ip: req.ip } },
      })
    }

    return res.json({
      success: true,
      reference:   order.reference,
      state:       order.state,
      amount:      order.amount,
      service:     order.service,
      area:        order.area,
      expiresAt:   order.expiresAt,
      buyerMasked: maskPhone(order.buyer?.phone),
    })
  } catch (err) {
    logger.error('getLinkOrder failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


// ── Seller submits evidence via link (no auth — bound by ref) ─────────────
const submitEvidence = async (req, res) => {
  try {
    const { ref } = req.params
    const { sellerNote, photo } = req.body

    if (!sellerNote || sellerNote.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Note too short — min 5 characters' })
    }

    const order = await prisma.order.findUnique({
      where:   { reference: ref },
      include: { dispute: true },
    })
    if (!order)          return res.status(404).json({ success: false, message: 'Order not found' })
    if (!order.dispute)  return res.status(400).json({ success: false, message: 'No dispute on this order' })
    if (order.state !== 'DISPUTED') {
      return res.status(400).json({ success: false, message: 'Order is not in disputed state' })
    }
    if (order.dispute.sellerNote) {
      return res.status(400).json({ success: false, message: 'Evidence already submitted' })
    }

    let sellerEvidenceUrl = null
    if (photo) {
      try {
        const uploaded = await cloudinary.uploader.upload(photo, {
          folder:          'lipasafe/dispute-evidence/order',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          transformation:  [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
        })
        sellerEvidenceUrl = uploaded.secure_url
      } catch (uploadErr) {
        logger.error('Evidence photo upload failed', { ref, error: uploadErr.message })
        return res.status(400).json({ success: false, message: 'Photo upload failed — try a smaller image' })
      }
    }

    await prisma.orderDispute.update({
      where: { id: order.dispute.id },
      data:  {
        sellerNote:        sellerNote.trim(),
        sellerEvidenceUrl,
      },
    })

    await prisma.orderEvent.create({
      data: {
        orderId:  order.id,
        action:   'SELLER_EVIDENCE_SUBMITTED',
        actor:    'seller',
        metadata: { ip: req.ip, hasPhoto: !!sellerEvidenceUrl },
      },
    })

    logger.info('Seller evidence submitted', { ref, orderId: order.id })
    return res.json({ success: true, message: 'Evidence submitted — admin will review and decide' })
  } catch (err) {
    logger.error('submitEvidence failed', { error: err.message })
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

module.exports = { getLinkOrder, submitEvidence }
