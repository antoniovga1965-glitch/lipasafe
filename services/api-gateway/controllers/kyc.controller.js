'use strict'
const { z }          = require('zod')
const prisma         = require('../src/utils/prisma')
const logger         = require('../src/utils/logger')
const { cloudinary } = require('../src/utils/cloudinary')
const { checkTrustedEligibility, promoteTrusted, getVerifiedSellers } = require('../src/services/kycService')

// ── GET /kyc/status ─────────────────────────────────────────────────────────
const getKycStatus = async (req, res) => {
  try {
    const userId = req.user.userId
    const user   = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        kycStatus: true,
        kycTier:   true,
        totalCompleted: true,
        totalDisputed:  true,
        createdAt:      true,
        sellerProfile: {
          select: {
            idNumber:          true,
            idDocUrl:          true,
            idBackUrl:         true,
            selfieUrl:         true,
            kycSubmittedAt:    true,
            kycRejectionReason:true,
            trustedSeller:     true,
            trustedAt:         true,
            rating:            true,
            transactionLimit:  true,
            businessName:      true,
            contactNumber:     true,
            category:          true,
            businessName:      true,
            category:          true,
            contactNumber:     true,
          },
        },
      },
    })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    // Check trusted eligibility live so frontend can show progress
    const eligibility = user.kycStatus === 'verified' && user.kycTier !== 'trusted'
      ? await checkTrustedEligibility(userId)
      : null

    return res.json({ success: true, data: { ...user, eligibility } })
  } catch (err) {
    console.error(err)
    logger.error('getKycStatus error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

// ── POST /kyc/submit-docs ────────────────────────────────────────────────────
// Called AFTER payment confirmed — user uploads ID + selfie as base64
const submitDocs = async (req, res) => {
  try {
    const userId = req.user.userId
    const schema = z.object({
      idNumber:        z.string().min(6).max(20),
      idFrontB64:      z.string().min(100),
      idBackB64:       z.string().min(100),
      selfieB64:       z.string().min(100),
      businessName:    z.string().min(2).max(60),
      serviceCategory: z.enum(['Bundles','Second Hand','Fundi','Delivery','House','Custom']),
      contactNumber:   z.string().min(9).max(15),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      logger.error('submitDocs validation failed', { issues: parsed.error.issues })
      console.error(parsed.error.issues)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const { idNumber, idFrontB64, idBackB64, selfieB64, businessName, serviceCategory, contactNumber } = parsed.data

    // Map UI display labels to Prisma Category enum values
    const CATEGORY_MAP = {
      'Bundles':     'bundles',
      'Second Hand': 'second_hand',
      'Fundi':       'fundi',
      'Delivery':    'delivery',
      'House':       'house_agent',
      'Custom':      'other', 
    }
    const category = CATEGORY_MAP[serviceCategory]

    // Must have paid first
    const payment = await prisma.kycPayment.findFirst({
      where: { userId, tier: 'verified', status: 'completed' },
    })
    if (!payment) {
      return res.status(403).json({ success: false, message: 'Pay KES 150 verification fee first' })
    }

    // Must not already be verified or pending
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true } })
    if (['pending', 'verified'].includes(user.kycStatus)) {
      
      return res.status(400).json({ success: false, message: `KYC already ${user.kycStatus}` })
    }

    // Upload all 3 to Cloudinary — private folder, no public access
    const uploadB64 = async (b64, publicId) => {
      const result = await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${b64}`,
        { folder: 'lipasafe/kyc', public_id: publicId, type: 'authenticated', overwrite: true, timeout: 120000 }
      )
      return result.secure_url
    }
    const [idFrontUrl, idBackUrl, selfieUrl] = await Promise.all([
      uploadB64(idFrontB64, `${userId}_id_front`),
      uploadB64(idBackB64,  `${userId}_id_back`),
      uploadB64(selfieB64,  `${userId}_selfie`),
    ])

    await prisma.$transaction([
      prisma.sellerProfile.upsert({
        where:  { userId },
        create: {
          userId,
          category:        category,
          businessName,
          contactNumber,
          idNumber,
          idDocUrl:        idFrontUrl,
          idBackUrl,
          selfieUrl,
          kycSubmittedAt:  new Date(),
        },
        update: {
          category:           category,
          businessName,
          contactNumber,
          idNumber,
          idDocUrl:           idFrontUrl,
          idBackUrl,
          selfieUrl,
          kycSubmittedAt:     new Date(),
          kycRejectionReason: null,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data:  { kycStatus: 'pending' },
      }),
    ])

    logger.info('KYC docs submitted', { userId })
    return res.json({ success: true, message: 'Documents submitted. Review takes up to 24 hours.' })
  } catch (err) {
    console.error(err)
    logger.error('submitDocs error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

// ── GET /kyc/sellers ────────────────────────────────────────────────────────
const listVerifiedSellers = async (req, res) => {
  try {
    const schema = z.object({
      category: z.string().optional(),
      tier:     z.enum(['verified', 'trusted']).optional(),
      page:     z.coerce.number().min(1).default(1),
      limit:    z.coerce.number().min(1).max(50).default(20),
    })
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })
    }

    const result = await getVerifiedSellers(parsed.data)
    return res.json({ success: true, data: result })
  } catch (err) {
    logger.error('listVerifiedSellers error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

// ── GET /kyc/trusted-check ───────────────────────────────────────────────────
const trustedCheck = async (req, res) => {
  try {
    const result = await checkTrustedEligibility(req.user.userId)
    return res.json({ success: true, data: result })
  } catch (err) {
    logger.error('trustedCheck error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}


// ── POST /kyc/claim-trusted ──────────────────────────────────────────────────
const claimTrusted = async (req, res) => {
  try {
    const userId = req.user.userId
    const { eligible, reason, checks } = await checkTrustedEligibility(userId)
    if (!eligible) {
      return res.status(400).json({ success: false, message: reason, checks })
    }
    await promoteTrusted(userId)
    return res.json({ success: true, message: 'Trusted badge activated!', checks })
  } catch (err) {
    logger.error('claimTrusted error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

module.exports = { getKycStatus, submitDocs, listVerifiedSellers, trustedCheck, claimTrusted }
