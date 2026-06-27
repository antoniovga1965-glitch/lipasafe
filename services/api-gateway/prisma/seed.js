'use strict'
require('dotenv').config()
const prisma = require('../../api-gateway/src/utils/prisma')
const bcrypt = require('bcrypt')
const crypto = require('crypto')

async function seed() {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'platform@lipasafe.co.ke' },
        { phone: '0727669032' }
      ]
    },
    include: { wallet: true }
  })

  if (existing) {
    console.log('✓ Platform user already exists — skipping create')
    console.log('  email:', existing.email)
    console.log('  wallet id:', existing.wallet?.id ?? 'no wallet found')
    return
  }

  const user = await prisma.user.create({
    data: {
      phone:         '0727669032',
      email:         'platform@lipasafe.co.ke',
      fullName:      'LipaSafe Platform',
      pinHash:       await bcrypt.hash(crypto.randomUUID(), 12),
      accountStatus: 'active',
      role:          'admin',
      wallet:        { create: {} }
    },
    include: { wallet: true }
  })

  console.log('✓ Platform wallet created — wallet id:', user.wallet.id)
}

seed().catch(console.error).finally(() => prisma.$disconnect())