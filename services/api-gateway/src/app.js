'use strict'
require('dotenv').config()
const path = require('path')
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

// ─── LEGAL PAGES (required for Google Play Store submission) ──
app.get('/privacy', (req, res) => res.json({
  success: true,
  content: `LipaSafe Privacy Policy

Last updated: ${new Date().toISOString().slice(0, 10)}

1. Introduction
LipaSafe ("we", "us", "our") operates an escrow and payments platform for users in Kenya. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our website, mobile application, and related services (collectively, the "Service").

2. Information We Collect
We collect information you provide directly, including your name, phone number, national ID or KYC documents, email address, and delivery or transaction details. When you use M-Pesa to fund, receive, or withdraw money through the Service, we receive transaction metadata from Safaricom's M-Pesa Daraja API, including phone number, M-Pesa receipt number, transaction amount, and timestamp. We do not receive or store your M-Pesa PIN.

3. How We Use Your Information
We use your information to create and manage your account, process M-Pesa payments and escrow transactions, verify your identity (KYC/AML compliance), detect and prevent fraud, resolve disputes between buyers and sellers, send transaction notifications via SMS or push notification, and comply with Kenyan legal and regulatory obligations, including those under the Data Protection Act, 2019.

4. M-Pesa Integration
LipaSafe integrates with Safaricom's M-Pesa Daraja API to facilitate deposits, escrow holds, and payouts. Transaction data shared with Safaricom is limited to what is required to process a payment. We do not sell or share your M-Pesa transaction history with third parties for marketing purposes.

5. Data Sharing
We may share your information with Safaricom (for M-Pesa processing), our KYC/identity verification providers, law enforcement or regulators where required by law, and service providers who help us operate the platform (e.g. cloud hosting, SMS delivery), under confidentiality obligations. We do not sell your personal data.

6. Data Retention
We retain transaction and account records for as long as your account is active and for a reasonable period afterward to comply with financial recordkeeping obligations under Kenyan law, resolve disputes, and enforce our agreements.

7. Your Rights
Under the Data Protection Act, 2019 (Kenya), you have the right to access the personal data we hold about you, request correction of inaccurate data, request deletion of your data (subject to legal retention requirements), object to certain processing, and lodge a complaint with the Office of the Data Protection Commissioner (ODPC).

8. Security
We use encryption in transit, access controls, and rate limiting to protect your data. While no system is completely secure, we take reasonable technical and organizational measures to safeguard your information.

9. Children's Privacy
The Service is not directed at children under 18. We do not knowingly collect personal information from minors.

10. Changes to This Policy
We may update this Privacy Policy from time to time. Continued use of the Service after changes take effect constitutes acceptance of the updated policy.

11. Contact Us
If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at support@lipasafe.co.ke.`
}))

app.get('/terms', (req, res) => res.json({
  success: true,
  content: `LipaSafe Terms of Service

Last updated: ${new Date().toISOString().slice(0, 10)}

1. Acceptance of Terms
By creating an account or using LipaSafe (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service.

2. Description of Service
LipaSafe is an escrow and payments platform that allows users in Kenya to hold funds securely via M-Pesa until agreed conditions between a buyer and seller (or contracting parties) are met, including secondhand goods sales, fundi (artisan) jobs, house rentals, and deliveries.

3. Eligibility
You must be at least 18 years old and legally capable of entering into binding contracts under Kenyan law to use the Service. You must provide accurate KYC information when requested.

4. Acceptable Use
You agree not to use the Service for any unlawful purpose, including money laundering, fraud, or financing of illegal activity; misrepresent the goods, services, or property involved in a transaction; attempt to circumvent escrow protections to defraud another user; or interfere with or disrupt the integrity of the Service, including attempting to breach security controls. We reserve the right to suspend or terminate accounts that violate these Terms.

5. Payment Obligations
All payments are processed through Safaricom M-Pesa. By initiating a transaction, you authorize LipaSafe to hold your funds in escrow until the applicable release conditions (e.g. delivery confirmation, job completion, rental period) are satisfied. Funds are released to the seller, fundi, landlord, or counterparty once conditions are met, or refunded to the payer where a transaction is cancelled or a dispute is resolved in their favor. LipaSafe may charge service fees, which will be disclosed before you confirm a transaction. You are responsible for ensuring the M-Pesa number used belongs to you or is authorized for your use.

6. Disputes
If a disagreement arises between transacting parties, either party may raise a dispute through the Service. LipaSafe will review evidence submitted by both parties, including photos, messages, and delivery confirmations, and make a determination on fund release in good faith. LipaSafe's decision on a dispute is final and binding for the purposes of releasing escrowed funds, without prejudice to either party's right to pursue further legal remedies under Kenyan law.

7. Limitation of Liability
LipaSafe acts solely as an escrow and payment facilitator. We are not a party to the underlying sale, rental, or service agreement between users and do not guarantee the quality, safety, or legality of goods, services, or property exchanged. To the maximum extent permitted by law, LipaSafe shall not be liable for indirect, incidental, or consequential damages arising from your use of the Service. Our aggregate liability for any claim shall not exceed the amount of the transaction giving rise to the claim.

8. Account Suspension and Termination
We may suspend or terminate your account if we suspect fraud, violation of these Terms, or a breach of applicable law. You may close your account at any time, provided there are no pending transactions or disputes.

9. Governing Law
These Terms are governed by the laws of the Republic of Kenya. Any disputes not resolved through LipaSafe's internal dispute process shall be subject to the exclusive jurisdiction of the courts of Kenya.

10. Changes to These Terms
We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.

11. Contact Us
For questions about these Terms, contact us at support@lipasafe.co.ke.`
}))

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
