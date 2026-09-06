#!/usr/bin/env node
'use strict'
require('dotenv').config({ path: '/mnt/datassd/projects-and-docs/lipasafe/services/api-gateway/.env' })
/**
 * scripts/withdrawPlatformWallet.js
 *
 * Withdraws KES 70 from the PLATFORM WALLET LEDGER BALANCE (not the raw
 * M-Pesa Utility account) to 0727669032 via B2C. Self-contained — debit
 * logic is inline here, no changes needed to platformWallet.js.
 *
 * Safety:
 *  - Reads availableBalance from Prisma first — refuses if amount exceeds it.
 *  - Debits the ledger BEFORE calling B2C (so a crash mid-run can't double-spend).
 *  - If B2C fails outright, automatically reverts the debit.
 *  - Idempotent: re-running with the same --ref will not double-withdraw.
 *
 * Usage:
 *   node scripts/withdrawPlatformWallet.js
 *   node scripts/withdrawPlatformWallet.js --amount 70 --phone 0727669032 --ref manual-withdrawal-70-aug19
 */

const prisma = require('../src/utils/prisma')
const { initiateB2C } = require('../src/utils/mpesaB2C')
const { getPlatformWalletId } = require('../src/utils/platformWallet')
const logger = require('../src/utils/logger')

const parseArgs = () => {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i += 2) {
    out[args[i].replace(/^--/, '')] = args[i + 1]
  }
  return out
}

const debitPlatformWallet = async (walletId, amount, reference, note) => {
  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      availableBalance: { decrement: amount },
      totalOut:          { increment: amount },
      lastUpdated:        new Date()
    }
  })

  await prisma.walletTransaction.upsert({
    where:  { reference },
    update: { status: 'pending', amount },
    create: {
      fromWalletId: walletId,
      type:         'withdrawal',
      amount,
      reference,
      note,
      status:       'pending'
    }
  })
}

const revertDebit = async (walletId, amount, reference, failureNote) => {
  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      availableBalance: { increment: amount },
      totalOut:          { decrement: amount },
      lastUpdated:        new Date()
    }
  })

  await prisma.walletTransaction.update({
    where: { reference },
    data:  { status: 'failed', note: failureNote }
  })
}

const main = async () => {
  const args = parseArgs()
  const numericAmount = Number(args.amount || 70)
  const phone = args.phone || '0727669032'
  const ref = args.ref || `manual-withdrawal-${numericAmount}-${new Date().toISOString().slice(0, 10)}`

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    console.error('Amount must be a positive number')
    process.exit(1)
  }

  // 1. Verify against the LEDGER balance, not the raw M-Pesa Utility balance
  const walletId = await getPlatformWalletId()
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    select: { availableBalance: true }
  })

  if (!wallet) {
    console.error('Platform wallet not found')
    process.exit(1)
  }

  console.log(`Platform wallet ledger balance: KES ${wallet.availableBalance}`)

  if (numericAmount > Number(wallet.availableBalance)) {
    console.error(`Refusing: requested KES ${numericAmount} exceeds verified ledger balance KES ${wallet.availableBalance}`)
    process.exit(1)
  }

  // 2. Debit the ledger first (source of truth)
  await debitPlatformWallet(walletId, numericAmount, ref, `Manual platform withdrawal to ${phone}`)
  console.log(`Ledger debited: KES ${numericAmount} (ref: ${ref})`)

  // 3. Fire the B2C payout
  try {
    const result = await initiateB2C({
      phone,
      amount: numericAmount,
      originatorId: ref,
      transactionId: ref,
      remarks: 'LipaSafe platform wallet withdrawal'
    })
    console.log('B2C initiated successfully:', result)

    await prisma.walletTransaction.update({
      where: { reference: ref },
      data: { status: 'completed' }
    })
    console.log('Withdrawal complete. Awaiting B2C result callback for final confirmation.')

  } catch (err) {
    console.error('B2C call failed outright — reverting ledger debit:', err.message)
    await revertDebit(walletId, numericAmount, ref, `B2C failed: ${err.message}`)
    process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch(async (err) => {
  logger.error('withdrawPlatformWallet fatal error', { err: err.message })
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})