'use strict'
const express = require('express')
const router  = express.Router()
const { cloudinary } = require('../utils/cloudinary')
const auth    = require('../middleware/layer2-identity/auth')

router.use(auth)

router.get('/me', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: { id: true, fullName: true, phone: true, email: true, role: true, kycStatus: true, accountStatus: true, avatarUrl: true, createdAt: true }
    })
    console.log('GET me avatarUrl:', user?.avatarUrl);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    return res.json({ success: true, user })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, stack: err.stack })
  }
})

router.get('/wallet', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    const { getTotalEscrowHeld } = require('../services/escrowAggregator')
    const wallet = await prisma.wallet.findUnique({
      where:  { userId: req.user.userId },
      select: { id: true, availableBalance: true, escrowBalance: true, pendingBalance: true, totalIn: true, totalOut: true, currency: true }
    })
    if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' })
    const realEscrowBalance = await getTotalEscrowHeld(req.user.userId)
    return  res.json({ success: true, wallet: { ...wallet, escrowBalance: realEscrowBalance } })
  } catch (err) {
   return res.status(500).json({ success: false, message: err.message, stack: err.stack })
  }
})

router.get('/notifications', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    const page  = parseInt(req.query.page)  || 1
    const limit = parseInt(req.query.limit) || 20
    const skip  = (page - 1) * limit
    const [notifs, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where:   { userId: req.user.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limit,
        select:  { id: true, type: true, messageEn: true, messageSw: true, status: true, createdAt: true, transactionId: true, transferId: true, houseEscrowId: true, orderId: true, requestId: true, deliveryOrderId: true, customEscrowId: true, fundiJobId: true }
      }),
      prisma.notification.count({ where: { userId: req.user.userId } }),
      prisma.notification.count({ where: { userId: req.user.userId, status: 'pending' } }),
    ])
   return res.json({ success: true, notifications: notifs, unreadCount, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
  } catch (err) {
   return res.status(500).json({ success: false, message: err.message, stack: err.stack })
  }
})

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    await prisma.notification.update({
      where: { id: req.params.id },
      data:  { status: 'read' }
    })
   return res.json({ success: true })
  } catch (err) {
   return res.status(500).json({ success: false, message: err.message, stack: err.stack })
  }
})
 
router.patch('/profile', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    const { fullName, email } = req.body
    const data = {}
    if (fullName) data.fullName = fullName
    if (email)    data.email    = email
    const user = await prisma.user.update({
      where:  { id: req.user.userId },
      data,
      select: { 
        id: true, fullName: true, phone: true, email: true, 
        role: true, kycStatus: true, accountStatus: true, 
        createdAt: true, avatarUrl: true  
      }
    })
   return res.json({ success: true, user })
  } catch (err) {
   return res.status(500).json({ success: false, message: err.message, stack: err.stack })
  }
})


router.patch('/avatar', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    const { image, mimeType } = req.body
    if (!image) return res.status(400).json({ success: false, message: 'No image provided' })

    const result = await cloudinary.uploader.upload(`data:${mimeType || 'image/jpeg'};base64,${image}`, {
      folder: 'lipasafe/avatars',
      transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
    })

    const user = await prisma.user.update({
      where:  { id: req.user.userId },
      data:   { avatarUrl: result.secure_url },
      select: { id: true, avatarUrl: true }
    })

    console.log('SAVED avatarUrl:', user.avatarUrl);
    console.log('SAVED avatarUrl:', user.avatarUrl);
    return res.json({ success: true, user })
  } catch (err) {
    console.error('AVATAR ERROR:', err.message)
    return res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/stats', async (req, res) => {
  try {
    const prisma  = require('../utils/prisma')
    const userId  = req.user.userId
    const [totalTx, totalVolume, wallet] = await Promise.all([
      prisma.transaction.count({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }], state: { in: ['released', 'refunded', 'confirmed'] } }
      }),
      prisma.transaction.aggregate({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }], state: { in: ['released', 'refunded', 'confirmed'] } },
        _sum:  { amount: true }
      }),
      prisma.wallet.findUnique({
        where:  { userId },
        select: { availableBalance: true, pendingBalance: true }
      })
    ])
   return res.json({
      success: true,
      stats: {
        totalTransactions: totalTx,
        totalVolume:       totalVolume._sum.amount || 0,
        balance:           wallet?.availableBalance || 0,
        escrowBalance:     wallet?.pendingBalance   || 0,
      }
    })
  } catch (err) {
    const logger = require('../utils/logger')
    logger.error('GET /stats failed', { userId: req.user.userId, error: err.message, stack: err.stack })
    return res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/push-token', async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ success: false, message: 'Token required' })
    const prisma = require('../utils/prisma')
    await prisma.user.update({ where: { id: req.user.userId }, data: { pushToken: token } })
   return res.json({ success: true })
  } catch (err) {
   return res.status(500).json({ success: false, message: err.message, stack: err.stack })
  }
})

router.delete('/notifications/:id', async (req, res) => {
  try {
    const prisma = require('../utils/prisma')
    await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user.userId } })
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
})


// ── Resolve phone to LipaSafe user name ──────────────────────────────────
router.get(`/resolve-phone`, async (req, res) => {
  try {
    const { resolvePhone } = require(`../utils/resolvePhone`)
    const { phone } = req.query
    if (!phone) return res.status(400).json({ success: false, message: `phone query param required` })
    const result = await resolvePhone(phone)
    return res.json({ success: true, ...result })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
})

// TEMP: socket smoke test — remove after testing
router.get('/test-socket/:userId', (req, res) => {
  const { emitToUser } = require('../utils/socket')
  emitToUser(req.params.userId, 'notification', {
    id: 'test-1', type: 'test',
    message: 'Socket works!',
    createdAt: new Date()
  })
  res.json({ sent: true })
})
module.exports = router