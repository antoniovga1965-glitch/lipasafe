require('dotenv').config({ path: '/mnt/datassd/projects-and-docs/lipasafe/services/api-gateway/.env' })
const prisma = require('./src/utils/prisma')
const { getPlatformWalletId } = require('./src/utils/platformWallet')

;(async () => {
  const walletId = await getPlatformWalletId()
  const txs = await prisma.walletTransaction.findMany({
    where: { OR: [{ fromWalletId: walletId }, { toWalletId: walletId }] },
    orderBy: { createdAt: 'asc' },
  })

  let running = 0
  const suspicious = []

  for (const t of txs) {
    if (t.status !== 'completed') continue // pending/failed never touched the real balance
    const isDebit = t.fromWalletId === walletId
    const delta = isDebit ? -Number(t.amount) : Number(t.amount)
    running += delta

    if (t.type === 'send' && !isDebit) {
      suspicious.push(t) // a 'send' crediting the platform wallet is unexpected
    }

    console.log(
      t.createdAt.toISOString(),
      t.type.padEnd(14),
      (delta >= 0 ? '+' : '') + delta,
      '  running:', running.toFixed(2),
      ' ', t.reference
    )
  }

  console.log('\n=== FINAL COMPUTED BALANCE:', running.toFixed(2), '===')

  const live = await prisma.wallet.findUnique({ where: { id: walletId }, select: { availableBalance: true } })
  console.log('=== LIVE wallet.availableBalance:', live.availableBalance.toString(), '===')

  if (suspicious.length) {
    console.log('\n⚠️  SUSPICIOUS: "send" transactions crediting the platform wallet (should credit a customer wallet, not platform):')
    suspicious.forEach(t => console.log(' -', t.reference, t.amount, t.note))
  }

  await prisma.$disconnect()
})()