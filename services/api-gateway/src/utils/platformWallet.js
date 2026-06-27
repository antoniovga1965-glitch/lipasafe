'use strict'
const prisma = require('./prisma')

let cachedWalletId = null

const getPlatformWalletId = async () => {
  if (cachedWalletId) return cachedWalletId
  const platform = await prisma.user.findUnique({
    where: { email: 'platform@lipasafe.co.ke' },
    select: { wallet: { select: { id: true } } }
  })
  if (!platform?.wallet?.id) throw new Error('Platform wallet not found — run seed')
  cachedWalletId = platform.wallet.id
  return cachedWalletId
}

const credit = async (db, amount, transactionId, note = 'Platform fee from escrow release') => {
  const walletId = await getPlatformWalletId()

  await db.wallet.update({
    where: { id: walletId },
    data: {
      availableBalance: { increment: amount },
      totalIn:          { increment: amount },
      lastUpdated:      new Date()
    }
  })

  await db.walletTransaction.upsert({
    where:  { reference: transactionId },
    update: { status: 'completed', amount },
    create: {
      toWalletId: walletId,
      type:       'platform_fee',
      amount,
      reference:  transactionId,
      note,
      status:     'completed'
    }
  })
}

module.exports = { getPlatformWalletId, credit }
