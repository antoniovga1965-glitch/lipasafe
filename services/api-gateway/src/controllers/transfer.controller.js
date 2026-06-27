'use strict'
const prisma            = require('../utils/prisma')
const logger            = require('../utils/logger')
const { createAndSend } = require('../services/notificationService')
const { initiateB2C }   = require('../utils/mpesaB2C')
const { Queue }         = require('bullmq')
const redis             = require('../utils/redis')
const Decimal           = require('decimal.js')

const transferQueue = new Queue('protectedTransfer', { connection: redis })

const normalizePhone = (p) => {
  p = p.toString().replace(/\s+/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0'))   return '254' + p.slice(1)
  if (p.startsWith('+'))   return p.slice(1)
  return p
}

const removeExpiryJob = async (id) => {
  try {
    const job = await transferQueue.getJob(`expire:${id}`)
    if (job) await job.remove()
  } catch (e) {
    logger.warn('Could not remove expiry job', { id, err: e.message })
  }
}

// ── Accept ────────────────────────────────────────────────────────────────
const accept = async (req, res) => {
  const { id } = req.params
  const callerId = req.user.userId
  try {
    const transfer = await prisma.protectedTransfer.findUnique({
      where: { id },
      include: { sender: { select: { phone: true, fullName: true } } }
    })
    if (!transfer) {
      return res.status(404).json({ success: false, message: 'Transfer not found' })
    }
    if (transfer.state !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Transfer already ${transfer.state.toLowerCase()}` })
    }

    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: { phone: true, fullName: true }
    })
    if (!caller) return res.status(404).json({ success: false, message: 'User not found' })

    if (normalizePhone(caller.phone) !== normalizePhone(transfer.recipientPhone)) {
      return res.status(403).json({ success: false, message: 'Not authorized to accept this transfer' })
    }

    // Recipient gets amount minus platform fee
    const recipientAmount = new Decimal(transfer.amount).toNumber() // amount already net — fee charged on top at STK
    const originatorId    = `PT-ACC-${id.slice(0, 16)}`

    await initiateB2C({
      phone:         transfer.recipientPhone,
      amount:        recipientAmount,
      originatorId,
      transactionId: id,
      remarks:       `SafeSend ${id.slice(0, 8)}`
    })

    await redis.set(`originator:${originatorId}`, `protected_transfer:${id}`, 'EX', 86400)
    await prisma.protectedTransfer.update({
      where: { id },
      data:  { state: 'ACCEPTED', acceptedAt: new Date() }
    })

    await removeExpiryJob(id)

    // Notify sender — push + SMS
    createAndSend({
      userId:   transfer.senderId,
      type:     'transfer_accepted',
      title:    'Transfer Accepted ✅',
      body:     `${caller.fullName} accepted your KES ${transfer.amount} SafeSend. Money released.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.sender.phone
    }).catch(e => logger.warn('Sender notify failed', { err: e.message }))

    // Notify recipient — push + SMS
    createAndSend({
      userId:   callerId,
      type:     'transfer_received',
      title:    'Money Incoming 💰',
      body:     `KES ${recipientAmount} from ${transfer.sender.fullName} is on its way to your M-Pesa.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.recipientPhone
    }).catch(e => logger.warn('Recipient notify failed', { err: e.message }))

    return res.json({ success: true, message: 'Transfer accepted. Money on the way to your M-Pesa.' })
  } catch (err) {
    logger.error('transfer.accept error', { id, err: err.message })
    return res.status(500).json({ success: false, message: 'Failed to accept transfer' })
  }
}

// ── Decline ───────────────────────────────────────────────────────────────
const decline = async (req, res) => {
  const { id } = req.params
  const callerId = req.user.userId
  try {
    const transfer = await prisma.protectedTransfer.findUnique({
      where: { id },
      include: { sender: { select: { phone: true, fullName: true } } }
    })
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' })
    if (transfer.state !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Transfer already ${transfer.state.toLowerCase()}` })
    }

    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: { phone: true, fullName: true }
    })
    if (!caller) return res.status(404).json({ success: false, message: 'User not found' })

    if (normalizePhone(caller.phone) !== normalizePhone(transfer.recipientPhone)) {
      return res.status(403).json({ success: false, message: 'Not authorized to decline this transfer' })
    }

    // Full refund to sender — amount + platformFee + b2cCharge
    const refundAmount = new Decimal(transfer.amount).toDecimalPlaces(0).toNumber() // platformFee kept by LipaSafe, b2cCharge offsets refund payout cost
    const originatorId = `PT-DEC-${id.slice(0, 16)}`

    await initiateB2C({
      phone:         transfer.sender.phone,
      amount:        refundAmount,
      originatorId,
      transactionId: id,
      remarks:       `SafeSend declined refund ${id.slice(0, 8)}`
    })

    await redis.set(`originator:${originatorId}`, `protected_transfer:${id}`, 'EX', 86400)
    await prisma.protectedTransfer.update({
      where: { id },
      data:  { state: 'DECLINED', declinedAt: new Date() }
    })

    await removeExpiryJob(id)

    // Notify sender
    createAndSend({
      userId:   transfer.senderId,
      type:     'transfer_declined',
      title:    'Transfer Declined',
      body:     `${caller.fullName} declined your KES ${transfer.amount} SafeSend. Full refund on the way.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.sender.phone
    }).catch(e => logger.warn('Sender notify failed', { err: e.message }))

    // Notify recipient
    createAndSend({
      userId:   callerId,
      type:     'transfer_declined',
      title:    'Transfer Declined',
      body:     `You declined KES ${transfer.amount} from ${transfer.sender.fullName}.`,
      channels: ['PUSH'],
      phone:    transfer.recipientPhone
    }).catch(e => logger.warn('Recipient notify failed', { err: e.message }))

    return res.json({ success: true, message: 'Transfer declined. Full refund sent to sender.' })
  } catch (err) {
    logger.error('transfer.decline error', { id, err: err.message })
    return res.status(500).json({ success: false, message: 'Failed to decline transfer' })
  }
}

// ── Cancel ────────────────────────────────────────────────────────────────
const cancel = async (req, res) => {
  const { id } = req.params
  const callerId = req.user.userId
  try {
    const transfer = await prisma.protectedTransfer.findUnique({
      where: { id },
      include: { sender: { select: { phone: true, fullName: true } } }
    })
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' })
    if (transfer.state !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Transfer already ${transfer.state.toLowerCase()}` })
    }
    if (transfer.senderId !== callerId) {
      return res.status(403).json({ success: false, message: 'Only the sender can cancel' })
    }

    const refundAmount = new Decimal(transfer.amount).toDecimalPlaces(0).toNumber() // platformFee kept by LipaSafe, b2cCharge offsets refund payout cost
    const originatorId = `PT-CAN-${id.slice(0, 16)}`

    await initiateB2C({
      phone:         transfer.sender.phone,
      amount:        refundAmount,
      originatorId,
      transactionId: id,
      remarks:       `SafeSend cancelled refund ${id.slice(0, 8)}`
    })

    await redis.set(`originator:${originatorId}`, `protected_transfer:${id}`, 'EX', 86400)
    await prisma.protectedTransfer.update({
      where: { id },
      data:  { state: 'CANCELLED', cancelledAt: new Date() }
    })

    await removeExpiryJob(id)

    createAndSend({
      userId:   callerId,
      type:     'transfer_cancelled',
      title:    'Transfer Cancelled',
      body:     `Your KES ${transfer.amount} SafeSend was cancelled. Full refund on the way.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.sender.phone
    }).catch(e => logger.warn('Notify failed', { err: e.message }))

    return res.json({ success: true, message: 'Transfer cancelled. Full refund sent to your M-Pesa.' })
  } catch (err) {
    logger.error('transfer.cancel error', { id, err: err.message })
    return res.status(500).json({ success: false, message: 'Failed to cancel transfer' })
  }
}

// ── Get Transfer ──────────────────────────────────────────────────────────
const getTransfer = async (req, res) => {
  const { id } = req.params
  const callerId = req.user.userId
  try {
    const transfer = await prisma.protectedTransfer.findUnique({
      where: { id },
      include: { sender: { select: { fullName: true, phone: true, avatarUrl: true } } }
    })
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' })

    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: { phone: true }
    })

    const isSender    = transfer.senderId === callerId
    const isRecipient = normalizePhone(caller.phone) === normalizePhone(transfer.recipientPhone)

    if (!isSender && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Not authorized' })
    }

    return res.json({ success: true, transfer, role: isSender ? 'sender' : 'recipient' })
  } catch (err) {
    logger.error('transfer.getTransfer error', { id, err: err.message })
    return res.status(500).json({ success: false, message: 'Failed to fetch transfer' })
  }
}


// ── List Transfers ────────────────────────────────────────────────────────
const listTransfers = async (req, res) => {
  const callerId = req.user.userId
  try {
    const caller = await prisma.user.findUnique({
      where:  { id: callerId },
      select: { phone: true }
    })
    if (!caller) return res.status(404).json({ success: false, message: 'User not found' })

    const normalizedPhone = normalizePhone(caller.phone)

    const transfers = await prisma.protectedTransfer.findMany({
      where: {
        OR: [
          { senderId: callerId },
          { recipientPhone: normalizedPhone }
        ]
      },
      include: { sender: { select: { fullName: true, phone: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    // Stamp role on each record so frontend doesn't need a phone comparison
    const result = transfers.map(t => ({
      ...t,
      role: t.senderId === callerId ? 'sender' : 'recipient'
    }))

    return res.json({ success: true, transfers: result })
  } catch (err) {
    logger.error('transfer.listTransfers error', { err: err.message })
    return res.status(500).json({ success: false, message: 'Failed to fetch transfers' })
  }
}

module.exports = { accept, decline, cancel, getTransfer, listTransfers }
