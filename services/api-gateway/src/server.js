'use strict'
require('dotenv').config()
const http       = require('http')
const { Server } = require('socket.io')
const jwt        = require('jsonwebtoken')
const app        = require('./app')
const { setIo }  = require('./utils/socket')
const logger     = require('./utils/logger')


// Start BullMQ workers 
require('./workers/smsWorker')
require('./workers/timerWorker')
require('./workers/b2cRetryWorker')
require('./workers/payoutReconciler')
require('./workers/fundiWorker')
require('./workers/fundiQueueWorker')
require('./workers/protectedTransferWorker')
require('./workers/deliveryAutoRefundWorker')
require('./workers/houseWorker')
require('./workers/customWorker')
require('./workers/customPaymentInitiatingSweeper')
require('./workers/housePaymentInitiatingSweeper')
require('./workers/houseB2cStuckReconciler')
require('./workers/houseAcceptanceExpirySweeper')
require('./workers/deliveryAutoRefundWorker')
require('./workers/ghostWalletRecallWorker')
require('./workers/disputeSlaWorker')
require('./workers/Requestmoneyexpiry')

// ── STK push reconciler — sweeps stuck initiated/payment_pending every 10 mins ──
const { reconcilePendingTransactions } = require('./controllers/mpesa.controller')
const { run: recoverStuckPayouts } = require('./jobs/recoverStuckPayouts')
reconcilePendingTransactions()
setInterval(reconcilePendingTransactions, 10 * 60 * 1000)
recoverStuckPayouts()
setInterval(recoverStuckPayouts, 5 * 60 * 1000)

// ── Ghost wallet recall — sweeps expired unclaimed wallets daily at 2 AM ──
const { ghostWalletRecallQueue } = require('./queues')
ghostWalletRecallQueue.add(
  'recall-expired-ghosts',
  {},
  {
    repeat: {
      pattern: '0 2 * * *', 
    },
    jobId: 'ghost-wallet-recall-daily',
  }
)

const PORT   = process.env.PORT || 3000
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin:      process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
})

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('No token'))
  try {
    const decoded  = jwt.verify(token, process.env.JWT_SECRET)
    socket.userId  = decoded.userId
    next()
  } catch { next(new Error('Invalid token')) }
})

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`)
  logger.info('Socket connected', { userId: socket.userId })
  socket.on('disconnect', () => logger.info('Socket disconnected', { userId: socket.userId }))
})

setIo(io)

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`LipaSafe API running on port ${PORT}`)
  console.log(`LipaSafe API running on port ${PORT}`)
})

// Handle unhandled promise rejections — catch anything that slips through
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise })
})

// Handle uncaught exceptions — log and die gracefully
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack })
  process.exit(1)
})
