'use strict'
const express    = require('express')
const router     = express.Router()
const authenticate = require('../middleware/layer2-identity/auth')
const adminAuth   = require('../middleware/layer2-identity/adminAuth')
const { uploadDeliveryPhotos } = require('../utils/cloudinary')
const {
  createOrder,
  beforePhoto,
  confirmBeforePhoto,
  pickupOTP,
  duringPhoto,
  receiptOTP,
  afterPhoto,
  received,
  extendTime,
  dispute,
  rate,
  highRiskStatus,
  history,
  deleteDeliveryOrder,
} = require('../controllers/delivery.controller')
const {
  open: openDispute,
  resolve: resolveDispute,
  compare: comparePhotos,
  getOne: getDispute,
  getOpen: getOpenDisputes,
} = require('../controllers/dispute.controller')

// ─── ORDER ────────────────────────────────────────
router.post('/create',                authenticate, createOrder)

// ─── PHOTO UPLOADS ────────────────────────────────
router.post('/before-photo',          authenticate, uploadDeliveryPhotos.single('photo'), beforePhoto)
router.post('/during-photo',          authenticate, uploadDeliveryPhotos.single('photo'), duringPhoto)
router.post('/after-photo',           authenticate, uploadDeliveryPhotos.single('photo'), afterPhoto)

// ─── OTP FLOW ─────────────────────────────────────
router.post('/confirm-before-photo',  authenticate, confirmBeforePhoto)
router.post('/enter-pickup-otp',      authenticate, pickupOTP)
router.post('/verify-receipt-otp',    authenticate, receiptOTP)

// ─── RECEIPT & PAYMENT ────────────────────────────
router.post('/mark-received',         authenticate, received)

// ─── UTILITIES ────────────────────────────────────
router.post('/extend-time',           authenticate, extendTime)
router.post('/dispute',               authenticate, dispute)

// ─── DISPUTE RESOLUTION ───────────────────────────
router.post('/disputes/open',          authenticate, openDispute)
router.post('/disputes/resolve',       adminAuth, resolveDispute)
router.get('/disputes/open',           adminAuth, getOpenDisputes)
router.get('/disputes/:disputeId',     authenticate, getDispute)
router.get('/disputes/compare/:orderId', authenticate, comparePhotos)
router.post('/rate',                  authenticate, rate)

// ─── QUERIES ──────────────────────────────────────
router.get('/high-risk',              authenticate, highRiskStatus)
router.get('/history',                authenticate, history)

router.delete('/:id', authenticate, deleteDeliveryOrder)
module.exports = router
