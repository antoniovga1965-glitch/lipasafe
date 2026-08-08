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
  let walletId = await getPlatformWalletId()

  const doUpdate = (id) => db.wallet.update({
    where: { id },
    data: {
      availableBalance: { increment: amount },
      totalIn:          { increment: amount },
      lastUpdated:      new Date()
    }
  })

  try {
    await doUpdate(walletId)
  } catch (err) {
    // Stale cached wallet ID (e.g. after DB reset/reseed) — clear cache and retry once
    if (err.code === 'P2025') {
      cachedWalletId = null
      walletId = await getPlatformWalletId()
      await doUpdate(walletId)
    } else {
      throw err
    }
  }

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
