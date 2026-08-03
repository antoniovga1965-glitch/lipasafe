'use strict'
const { z } = require('zod')
const crypto = require('crypto')
const Decimal = require('decimal.js')
const prisma = require('../src/utils/prisma')
const logger = require('../src/utils/logger')
const smsQueue = require('../src/queues/smsQueue')
const { getPlatformWalletId } = require('../src/utils/platformWallet')

const FEE_RATE = new Decimal('0.02')
const safeError = (res, status, message) => res.status(status).json({ success: false, message })

const normalizePhone = (phone) => {
  const s = phone.trim().replace(/\s/g, '')
  if (s.startsWith('+254')) return s.slice(1)
  if (s.startsWith('0')) return '254' + s.slice(1)
  return s
}

const RequestSchema = z.object({
  senderPhone: z.string().regex(/^\+?(?:254|0)[17]\d{8}$/, 'Invalid phone'),
  amount: z.coerce.number().min(1).max(70000),
  note: z.string().max(100).optional(),
})

// ─── CREATE REQUEST ───────────────────────────
const createRequest = async (req, res) => {
  try {
    const parsed = RequestSchema.safeParse(req.body)
    if (!parsed.success) return safeError(res, 400, parsed.error.issues[0].message)

    const { amount, note } = parsed.data
    const senderPhone = normalizePhone(parsed.data.senderPhone)
    const requesterId = req.user.userId

    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { phone: true, fullName: true }
    })
    if (requester.phone === senderPhone) return safeError(res, 400, 'Cannot request from yourself')

    const fee = new Decimal(amount).mul(FEE_RATE).toDecimalPlaces(2)
    const reference = `LR-${crypto.randomUUID()}`
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.paymentRequest.create({
      data: {
        requesterId,
        senderPhone,
        amount: new Decimal(amount).toFixed(2),
        fee: fee.toFixed(2),
        reference,
        note: note || null,
        expiresAt,
      }
    })

    try {
      await smsQueue.add('payment-request', {
        phone: senderPhone,
        requesterName: requester.fullName,
        amount: new Decimal(amount).toFixed(2),
        reference,
        type: 'payment_request'
      })
    } catch (smsErr) {
      logger.error('SMS failed for payment request', { smsErr: smsErr.message })
    }

    logger.info('Payment request created', { requesterId, senderPhone, amount, reference })

    return res.status(201).json({
      success: true,
      message: 'Payment request sent',
      reference,
      expiresAt,
    })
  } catch (err) {
    logger.error('createRequest error', { err: err.message })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── PAY REQUEST ──────────────────────────────
const payRequest = async (req, res) => {
  try {
    const { reference } = req.params
    const senderId = req.user.userId

    // Idempotency check
    const existingTx = await prisma.walletTransaction.findUnique({
      where: { clientRef: `pr:${reference}` },
      select: { reference: true }
    })
    if (existingTx) {
      return res.json({ success: true, message: 'Already paid', reference: existingTx.reference, deduplicated: true })
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { phone: true, accountStatus: true }
    })
    if (!sender) return safeError(res, 404, 'Sender not found')
    if (sender.accountStatus !== 'active') return safeError(res, 403, 'Account not active')

    const txReference = `LP-${crypto.randomUUID()}`

    await prisma.$transaction(async (tx) => {
      // Fetch inside transaction — prevents race condition
      const request = await tx.paymentRequest.findUnique({
        where: { reference },
        include: { requester: { select: { id: true, phone: true, fullName: true } } }
      })

      if (!request) throw new Error('NOT_FOUND')
      if (request.status !== 'pending') throw new Error(`ALREADY_${request.status.toUpperCase()}`)
      if (new Date() > request.expiresAt) {
        await tx.paymentRequest.update({ where: { reference }, data: { status: 'expired' } })
        throw new Error('EXPIRED')
      }
      if (sender.phone !== request.senderPhone) throw new Error('NOT_YOUR_REQUEST')

      const amount = new Decimal(request.amount)
      const fee = new Decimal(request.fee || 0)
      const totalDeduct = amount.plus(fee)

      const senderWallet = await tx.wallet.findUnique({ where: { userId: senderId } })
      if (!senderWallet) throw new Error('WALLET_NOT_FOUND')

      const requesterWallet = await tx.wallet.findUnique({ where: { userId: request.requesterId } })
      if (!requesterWallet) throw new Error('REQUESTER_WALLET_NOT_FOUND')

      const balance = new Decimal(senderWallet.availableBalance)
      if (balance.lt(totalDeduct)) throw new Error('INSUFFICIENT')

      // Deduct sender
      const deducted = await tx.wallet.updateMany({
        where: { userId: senderId, availableBalance: { gte: totalDeduct.toFixed(2) } },
        data: {
          availableBalance: { decrement: totalDeduct.toFixed(2) },
          totalOut: { increment: totalDeduct.toFixed(2) },
          lastUpdated: new Date(),
        }
      })
      if (deducted.count === 0) throw new Error('INSUFFICIENT')

      // Credit requester (amount only — fee stays in shortcode)
      await tx.wallet.update({
        where: { userId: request.requesterId },
        data: {
          availableBalance: { increment: amount.toFixed(2) },
          totalIn: { increment: amount.toFixed(2) },
          lastUpdated: new Date(),
        }
      })

      // Credit platform wallet with fee
      if (fee.gt(0)) {
        const platformWalletId = await getPlatformWalletId()
        await tx.wallet.update({
          where: { id: platformWalletId },
          data: {
            availableBalance: { increment: fee.toFixed(2) },
            totalIn: { increment: fee.toFixed(2) },
            lastUpdated: new Date(),
          }
        })
        // Ledger entry for platform fee — was previously missing, causing
        // an untracked credit with no audit row (found during SafeSend fee audit)
        await tx.walletTransaction.create({
          data: {
            toWallet:  { connect: { id: platformWalletId } },
            type:      'platform_fee',
            amount:    fee.toFixed(2),
            status:    'completed',
            reference: `${txReference}-fee`,
            note:      `Platform fee for payment request ${reference}`,
          }
        })
      }

      // Ledger entry
      await tx.walletTransaction.create({
        data: {
          fromWallet: { connect: { id: senderWallet.id } },
          toWallet:   { connect: { id: requesterWallet.id } },
          amount:     amount.toFixed(2),
          fee:        fee.toFixed(2),
          type:       'send',
          status:     'completed',
          reference:  txReference,
          clientRef:  `pr:${reference}`,
          note:       `Payment request ${reference}`,
        }
      })

      // Mark paid
      await tx.paymentRequest.update({
        where: { reference },
        data: { status: 'paid', paidAt: new Date() }
      })

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId:    senderId,
          actorType:  'user',
          action:     'payment_request_paid',
          entityType: 'PaymentRequest',
          entityId:   request.id,
          amount:     amount.toFixed(2),
          ipAddress:  req.ip,
          previousState: { balance: balance.toFixed(2) },
          newState: {
            reference,
            fee: fee.toFixed(2),
            totalDeducted: totalDeduct.toFixed(2),
            requesterPhone: request.requester.phone
          }
        }
      })
    }, { isolationLevel: 'Serializable', timeout: 10000 })

    try {
      await smsQueue.add('payment-request-paid', {
        phone: sender.phone,
        senderPhone: sender.phone,
        type: 'payment_received'
      })
    } catch (e) {}

    logger.info('Payment request paid', { reference, senderId, txReference })

    return res.json({
      success: true,
      message: 'Payment sent successfully',
      reference: txReference,
    })
  } catch (err) {
    if (err.message === 'INSUFFICIENT') return safeError(res, 400, 'Insufficient balance')
    if (err.message === 'WALLET_NOT_FOUND') return safeError(res, 404, 'Wallet not found')
    if (err.message === 'REQUESTER_WALLET_NOT_FOUND') return safeError(res, 404, 'Requester wallet not found')
    if (err.message === 'NOT_FOUND') return safeError(res, 404, 'Payment request not found')
    if (err.message === 'EXPIRED') return safeError(res, 400, 'Payment request has expired')
    if (err.message === 'NOT_YOUR_REQUEST') return safeError(res, 403, 'This request was not sent to you')
    if (err.code === 'P2002') return safeError(res, 409, 'Already paid')
    if (err.message?.startsWith('ALREADY_')) return safeError(res, 400, `Request already ${err.message.split('_')[1].toLowerCase()}`)
    logger.error('payRequest error', { err: err.message, stack: err.stack })
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── GET MY REQUESTS ──────────────────────────
const getMyRequests = async (req, res) => {
  try {
    const userId = req.user.userId
    const requests = await prisma.paymentRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return res.json({ success: true, requests })
  } catch (err) {
    return safeError(res, 500, 'Something went wrong')
  }
}

// ─── GET INCOMING REQUESTS ────────────────────
const getIncomingRequests = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { phone: true }
    })
    const requests = await prisma.paymentRequest.findMany({
      where: { senderPhone: user.phone, status: 'pending' },
      include: { requester: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, requests })
  } catch (err) {
    return safeError(res, 500, 'Something went wrong')
  }
}

module.exports = { createRequest, payRequest, getMyRequests, getIncomingRequests }
