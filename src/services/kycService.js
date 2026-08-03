'use strict'
const prisma  = require('../utils/prisma')
const logger  = require('../utils/logger')

const KYC_TIERS = {
  verified: { fee: 150, transactionLimit: '50000.00' },
  trusted:  { fee: 300, transactionLimit: '500000.00' },
}

// Check if user qualifies for trusted tier (data-driven, no human review)
const checkTrustedEligibility = async (userId) => {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      kycStatus:        true,
      kycTier:          true,
      totalCompleted:   true,
      totalDisputed:    true,
      createdAt:        true,
      sellerProfile:    { select: { rating: true, trustedSeller: true } },
    },
  })
  if (!user) return { eligible: false, reason: 'User not found' }
  if (user.kycStatus !== 'verified') return { eligible: false, reason: 'Must be verified first' }
  if (user.kycTier === 'trusted')    return { eligible: false, reason: 'Already trusted' }

  const ageInDays = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  const rating    = parseFloat(user.sellerProfile?.rating || 0)

  const checks = {
    verified:         user.kycStatus === 'verified',
    completedTrades:  user.totalCompleted >= 10,
    goodRating:       rating >= 4.0,
    accountAge:       ageInDays >= 30,
    lowDisputes:      user.totalDisputed <= 5,
  }

  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (failed.length > 0) return { eligible: false, reason: `Requirements not met: ${failed.join(', ')}`, checks }

  return { eligible: true, checks }
}

// Auto-promote to trusted after payment confirmed
const promoteTrusted = async (userId) => {
  await prisma.$transaction(async (tx) => {
    // Re-check eligibility inside transaction — prevents race condition
    const user = await tx.user.findUnique({
      where:  { id: userId },
      select: {
        kycStatus:      true,
        kycTier:        true,
        totalCompleted: true,
        totalDisputed:  true,
        createdAt:      true,
        sellerProfile:  { select: { rating: true, trustedSeller: true } },
      },
    })
    if (!user)                         throw new Error('User not found')
    if (user.kycStatus !== 'verified') throw new Error('Must be verified first')
    if (user.kycTier === 'trusted')    throw new Error('Already trusted')

    const ageInDays = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    const rating    = parseFloat(user.sellerProfile?.rating || 0)
    const checks = {
      verified:        user.kycStatus === 'verified',
      completedTrades: user.totalCompleted >= 10,
      goodRating:      rating >= 4.0,
      accountAge:      ageInDays >= 30,
      lowDisputes:     user.totalDisputed <= 1,
    }
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    if (failed.length > 0) throw new Error(`Requirements not met: ${failed.join(', ')}`)

    await tx.user.update({
      where: { id: userId },
      data:  { kycTier: 'trusted' },
    })

    // upsert — guards against missing sellerProfile row
    await tx.sellerProfile.upsert({
      where:  { userId },
      update: {
        trustedSeller:    true,
        trustedAt:        new Date(),
        transactionLimit: KYC_TIERS.trusted.transactionLimit,
      },
      create: {
        userId,
        trustedSeller:    true,
        trustedAt:        new Date(),
        transactionLimit: KYC_TIERS.trusted.transactionLimit,
        category:         'Custom',
      },
    })

    logger.info('User promoted to trusted', {
      userId,
      previousTier: user.kycTier,
      trigger:      'claimTrusted',
    })
  })
}

// Get public seller directory
const getVerifiedSellers = async ({ category, tier, page = 1, limit = 20 }) => {
  const where = {
    kycStatus: 'verified',
    accountStatus: 'active',
    sellerProfile: {
      isActive: true,
      ...(category ? { category } : {}),
      ...(tier === 'trusted' ? { trustedSeller: true } : {}),
    },
  }

  const [sellers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip:  (page - 1) * limit,
      take:  limit,
      select: {
        id:        true,
        fullName:  true,
        phone:     true,
        avatarUrl: true,
        kycTier:   true,
        totalCompleted: true,
        createdAt: true,
        sellerProfile: {
          select: {
            businessName:  true,
            category:      true,
            rating:        true,
            trustedSeller: true,
            trustedAt:     true,
          },
        },
      },
      orderBy: [
        { sellerProfile: { trustedSeller: 'desc' } },
        { sellerProfile: { rating: 'desc' } },
        { totalCompleted: 'desc' },
      ],
    }),
    prisma.user.count({ where }),
  ])

  return { sellers, total, page, pages: Math.ceil(total / limit) }
}

module.exports = { KYC_TIERS, checkTrustedEligibility, promoteTrusted, getVerifiedSellers }
