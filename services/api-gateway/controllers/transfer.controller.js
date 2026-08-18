'use strict'
const prisma            = require('../src/utils/prisma')
const logger            = require('../src/utils/logger')
const { createAndSend } = require('../src/services/notificationService')
const { initiateB2C }   = require('../src/utils/mpesaB2C')
const { Queue }         = require('bullmq')
const redis             = require('../src/utils/redis')
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
    const job = await transferQueue.getJob(`expire-${id}`)
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

    const claimed = await prisma.protectedTransfer.updateMany({
      where: { id, state: 'PENDING' },
      data:  { state: 'RELEASING', acceptedAt: new Date() }
    })
    if (claimed.count === 0) {
      return res.status(400).json({ success: false, message: 'Transfer already acted on' })
    }

    // Redis set BEFORE B2C — callback may fire before initiateB2C returns
    await redis.set(`originator:${originatorId}`, `protected_transfer:${id}`, 'EX', 86400)
    try {
      await initiateB2C({
        phone:         transfer.recipientPhone,
        amount:        recipientAmount,
        originatorId,
        transactionId: id,
        remarks:       `SafeSend ${id.slice(0, 8)}`
      })
    } catch (b2cErr) {
      await redis.del(`originator:${originatorId}`)
      await prisma.protectedTransfer.updateMany({
        where: { id, state: 'RELEASING' },
        data:  { state: 'PENDING', acceptedAt: null }
      })
      throw b2cErr
    }

    await removeExpiryJob(id)

    // Notify sender — push + SMS
    createAndSend({
      userId:   transfer.senderId,
      type:     'transfer_accepted',
      title:    'Transfer Accepted',
      body:     `${caller.fullName} accepted your KES ${transfer.amount} SafeSend. Money released.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.sender.phone
    }).catch(e => logger.warn('Sender notify failed', { err: e.message }))

    // Notify recipient — push + SMS
    createAndSend({
      userId:   callerId,
      type:     'transfer_received',
      title:    'Money Incoming ',
      body:     `KES ${recipientAmount} from ${transfer.sender.fullName} is on its way to your M-Pesa.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.recipientPhone
    }).catch(e => logger.warn('Recipient notify failed', { err: e.message }))

    return res.json({ success: true, message: 'Transfer accepted. Funds are being released to your M-Pesa.' })
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

    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: { phone: true, fullName: true }
    })
    if (!caller) return res.status(404).json({ success: false, message: 'User not found' })

    if (normalizePhone(caller.phone) !== normalizePhone(transfer.recipientPhone)) {
      return res.status(403).json({ success: false, message: 'Not authorized to decline this transfer' })
    }

    // Full refund to sender — amount + platformFee + b2cCharge
    const refundAmount = new Decimal(transfer.amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() // whole shillings — platformFee kept by LipaSafe
    const originatorId = `PT-DEC-${id.slice(0, 16)}`

    const claimedDec = await prisma.protectedTransfer.updateMany({
      where: { id, state: 'PENDING' },
      data:  { state: 'REFUNDING', declinedAt: new Date() }
    })
    if (claimedDec.count === 0) {
      return res.status(400).json({ success: false, message: 'Transfer already acted on' })
    }

    await redis.set(`originator:${originatorId}`, `protected_transfer:${id}`, 'EX', 86400)
    try {
      await initiateB2C({
        phone:         transfer.sender.phone,
        amount:        refundAmount,
        originatorId,
        transactionId: id,
        remarks:       `SafeSend declined refund ${id.slice(0, 8)}`
      })
    } catch (b2cErr) {
      await redis.del(`originator:${originatorId}`)
      await prisma.protectedTransfer.updateMany({
        where: { id, state: 'REFUNDING' },
        data:  { state: 'PENDING', declinedAt: null }
      })
      throw b2cErr
    }

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

    return res.json({ success: true, message: 'Transfer declined. Refund is being sent to the sender.' })
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
    if (transfer.senderId !== callerId) {
      return res.status(403).json({ success: false, message: 'Only the sender can cancel' })
    }

    const refundAmount = new Decimal(transfer.amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() // whole shillings — platformFee kept by LipaSafe
    const originatorId = `PT-CAN-${id.slice(0, 16)}`

    const claimedCan = await prisma.protectedTransfer.updateMany({
      where: { id, state: 'PENDING' },
      data:  { state: 'REFUNDING', cancelledAt: new Date() }
    })
    if (claimedCan.count === 0) {
      return res.status(400).json({ success: false, message: 'Transfer already acted on' })
    }

    await redis.set(`originator:${originatorId}`, `protected_transfer:${id}`, 'EX', 86400)
    try {
      await initiateB2C({
        phone:         transfer.sender.phone,
        amount:        refundAmount,
        originatorId,
        transactionId: id,
        remarks:       `SafeSend cancelled refund ${id.slice(0, 8)}`
      })
    } catch (b2cErr) {
      await redis.del(`originator:${originatorId}`)
      await prisma.protectedTransfer.updateMany({
        where: { id, state: 'REFUNDING' },
        data:  { state: 'PENDING', cancelledAt: null }
      })
      throw b2cErr
    }

    await removeExpiryJob(id)

    createAndSend({
      userId:   callerId,
      type:     'transfer_cancelled',
      title:    'Transfer Cancelled',
      body:     `Your KES ${transfer.amount} SafeSend was cancelled. Full refund on the way.`,
      channels: ['PUSH', 'SMS'],
      phone:    transfer.sender.phone
    }).catch(e => logger.warn('Notify failed', { err: e.message }))

    return res.json({ success: true, message: 'Transfer cancelled. Refund is on the way to your M-Pesa.' })
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
        AND: [
          {
            OR: [
              { senderId: callerId },
              { recipientPhone: normalizedPhone }
            ]
          },
          {
            OR: [
              { senderId: callerId,        deletedBySender: false },
              { recipientPhone: normalizedPhone, deletedByRecipient: false }
            ]
          }
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

// ── Delete (soft, per-party) ────────────────────────────────────────────
const deleteTransfer = async (req, res) => {
  const { id } = req.params
  const callerId = req.user.userId
  try {
    const transfer = await prisma.protectedTransfer.findUnique({ where: { id } })
    if (!transfer) {
      // Already gone — treat as success so bulk-delete UX doesn't choke
      return res.status(404).json({ success: false, message: 'Transfer not found' })
    }

    const caller = await prisma.user.findUnique({
      where: { id: callerId },
      select: { phone: true }
    })
    if (!caller) return res.status(404).json({ success: false, message: 'User not found' })

    const isSender    = transfer.senderId === callerId
    const isRecipient = normalizePhone(caller.phone) === normalizePhone(transfer.recipientPhone)

    if (!isSender && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this transfer' })
    }

    const data = {}
    if (isSender)    data.deletedBySender = true
    if (isRecipient) data.deletedByRecipient = true

    await prisma.protectedTransfer.update({ where: { id }, data })

    return res.json({ success: true, message: 'Transfer removed from your history' })
  } catch (err) {
    logger.error('transfer.deleteTransfer error', { id, err: err.message })
    return res.status(500).json({ success: false, message: 'Failed to delete transfer' })
  }
}

module.exports = { accept, decline, cancel, getTransfer, listTransfers, deleteTransfer }
