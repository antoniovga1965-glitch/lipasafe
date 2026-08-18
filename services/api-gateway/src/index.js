'use strict'
require('dotenv').config()
const http       = require('http')
const { Server } = require('socket.io')
const jwt        = require('jsonwebtoken')
const app        = require('./app')
const { setIo }  = require('./utils/socket')
const logger     = require('./utils/logger')

require('./workers/smsWorker')
require('./workers/fundiQueueWorker')
require('./workers/houseWorker')
require('./workers/protectedTransferWorker') 

const server = http.createServer(app)

const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', methods: ['GET', 'POST'], credentials: true },
})

// JWT auth for sockets
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('No token'))
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    socket.userId = decoded.userId
    next()
  } catch { next(new Error('Invalid token')) }
})

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`)
  logger.info('Socket connected', { userId: socket.userId })
  socket.on('disconnect', () => logger.info('Socket disconnected', { userId: socket.userId }))
})

setIo(io)

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  logger.info(`LipaSafe API running on port ${PORT}`)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise })
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack })
  process.exit(1)
})
