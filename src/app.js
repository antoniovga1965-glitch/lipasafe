'use strict'
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const logger = require('./utils/logger')
const { globalLimiter, authLimiter } = require('./middleware/layer1-gate/rateLimiter')

const secondHandRoutes = require('./routes/secondhand.routes')
const authRoutes = require('./routes/auth.routes')
const userRoutes = require('./routes/user.routes')
const walletRoutes = require('./routes/wallet.routes')
const mpesaRoutes  = require('./routes/mpesa.routes')
const paymentRequestRoutes = require('./routes/paymentRequest.routes')
const transactionRoutes    = require('./routes/transaction.routes')
const adminRoutes          = require('./utils/admin.routes')
const smsRoutes            = require('./routes/sms.routes')
const fundiRoutes          = require('./routes/fundi.routes')
const fundiMpesaRoutes     = require('./routes/fundiMpesa.routes')
const fundiSmsRoutes    = require('./routes/fundiSms.routes')
const houseRoutes         = require('./routes/house.routes')
const houseMpesaRoutes    = require('./routes/houseMpesa.routes')
const deliveryRoutes      = require('./routes/delivery.routes')
const deliveryMpesaRoutes = require('./routes/deliveryMpesa.routes')
const customRoutes         = require('./routes/custom.routes')
const disputeRoutes        = require('./routes/dispute.routes')
const kycRoutes            = require('./routes/kyc.routes')
const kycMpesaRoutes       = require('./routes/kycMpesa.routes')
const transferRoutes       = require('./routes/transfer.routes')
const transferMpesaRoutes  = require('./routes/transferMpesa.routes')
const orderRoutes          = require('./routes/order.routes')
const linkRoutes           = require('./routes/link.routes')
const houseLinkRoutes      = require('./routes/house-link.routes')
const uploadRoutes         = require('./routes/upload.routes')
const requestMoneyRoutes      = require('./routes/requestMoney.routes')
const requestMoneyMpesaRoutes = require('./routes/requestMoneyMpesa.routes')

const path = require('path')
const app = express()
app.use(express.static(path.join(__dirname, '../public')))
app.set('trust proxy', 1)

// ─── SECURITY MIDDLEWARE ──────────────────────────
app.use(helmet())

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',')
if (!allowedOrigins && process.env.NODE_ENV === 'production') {
  throw new Error('ALLOWED_ORIGINS must be set in production')
}

app.use(cors({
  origin: allowedOrigins || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// ─── RATE LIMITING ────────────────────────────────
app.use(globalLimiter)

// ─── GENERAL MIDDLEWARE ───────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: false }))

const httpLogger = require('./middleware/layer1-gate/httpLogger')
app.use(httpLogger)


const safaricomOnly = require('./middleware/layer1-gate/safaricomOnly')

// ─── ROUTES ───────────────────────────────────────
app.use('/auth', authLimiter, authRoutes) 
app.use('/second-hand', secondHandRoutes)
app.use('/user', userRoutes)
app.use('/wallet', walletRoutes)
app.use('/mpesa',  mpesaRoutes)
app.use('/transactions', transactionRoutes)
app.use('/admin', adminRoutes)
app.use('/custom', customRoutes)
app.use('/sms',   smsRoutes)
app.use('/fundi',          fundiRoutes)
app.use('/fundi-mpesa',    fundiMpesaRoutes)
app.use('/fundi-sms',      fundiSmsRoutes)
app.use('/house',            houseRoutes)
app.use('/house-mpesa',      houseMpesaRoutes)
app.use('/delivery',         deliveryRoutes)
app.use('/delivery-mpesa',   deliveryMpesaRoutes)
app.use('/disputes',         disputeRoutes)
app.use('/kyc',              kycRoutes)
app.use('/kyc-mpesa',        kycMpesaRoutes)
app.use('/transfer',         transferRoutes)
app.use('/transfer-mpesa',   safaricomOnly, transferMpesaRoutes)
app.use('/orders',           orderRoutes)
app.use('/link',             linkRoutes)
app.use('/house-link',       houseLinkRoutes)
app.use('/upload',           uploadRoutes)
app.use('/request-money',       requestMoneyRoutes)
app.use('/request-money-mpesa', safaricomOnly, requestMoneyMpesaRoutes)
const path = require('path')
// Relaxed CSP for seller link page — allows inline scripts (no user data here)
app.use('/order', helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc:  ["'self'", "'unsafe-inline'"],
    styleSrc:   ["'self'", "'unsafe-inline'"],
    imgSrc:     ["'self'", 'data:'],
  },
}), express.static(path.join(__dirname, 'public/order')))
app.get('/order/:ref', (req, res) => res.sendFile(path.join(__dirname, 'public/order/index.html')))


// ─── HEALTH CHECK ─────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// ─── 404 HANDLER ──────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }))

// ─── GLOBAL ERROR HANDLER ─────────────────────────
app.use((err, req, res, next) => {
  console.error('GLOBAL ERROR CAUGHT:')
  console.dir(err, { depth: null })

  logger.error('Unhandled error', {
    // Error details
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status || err.statusCode,
    stack: err.stack,

    // Request details
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,

    // Axios / HTTP client errors
    axios: err.config
      ? {
          method: err.config.method,
          url: err.config.url,
          baseURL: err.config.baseURL,
          timeout: err.config.timeout,
        }
      : undefined,

    response: err.response
      ? {
          status: err.response.status,
          data: err.response.data,
        }
      : undefined,

    // Network errors
    errno: err.errno,
    syscall: err.syscall,
    address: err.address,
    port: err.port,

    // Only log request payloads in development
    body: process.env.NODE_ENV === 'development' ? req.body : undefined,
    params: req.params,
    query: req.query,
  })

  res.status(err.status || err.statusCode || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : err.message,
  })


  // Prisma known errors
  if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Duplicate record conflict.' })
  if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Record not found.' })
  if (err.code === 'P2003') return res.status(400).json({ success: false, message: 'Invalid reference.' })

  // JWT errors
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Invalid token.' })
  if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired.' })

  // Payload too large
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request too large.' })

  // Syntax error in JSON body
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request body.' })
  }

  // Fallback
  return res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
  })
})

module.exports = app
