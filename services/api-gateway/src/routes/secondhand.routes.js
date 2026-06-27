'use strict'
const express = require('express')
const router  = express.Router()
const authenticate = require('../middleware/layer2-identity/auth')
const {
  createListing, getListings, getListing, updateListing, cancelListing,
  buyListing, sellerHandover, verifyHandoverOtp, acceptItem,
  openSecondHandDispute, sellerRespondToDispute,
  getMyListings, getMySecondHandTransactions, deleteSecondHandTransaction,
  dealBuy, getSellerPending, getOrderById, getTransactionStatus,
  uploadListingPhotosHandler,
} = require('../controllers/secondHand.controller')
const { uploadListingPhotos, uploadDisputeEvidence } = require('../utils/cloudinary')

// ─── PHOTO UPLOAD ────────────────────────────────
router.post('/upload-photos', authenticate, uploadListingPhotos.array('photos', 3), uploadListingPhotosHandler)
// ─── LISTINGS ─────────────────────────────────────
router.get('/',              authenticate, getListings)
router.post('/',             authenticate, createListing)
router.get('/mine',          authenticate, getMyListings)
router.get('/transactions',  authenticate, getMySecondHandTransactions)
router.get('/:id',           authenticate, getListing)
router.patch('/:id',         authenticate, updateListing)
router.delete('/transactions/:id', authenticate, deleteSecondHandTransaction)
router.delete('/:id',              authenticate, cancelListing)

// ─── ESCROW FLOW ──────────────────────────────────
router.post('/:id/buy',        authenticate, buyListing)
router.post('/:id/handover',   authenticate, sellerHandover)
router.post('/:id/verify-otp', authenticate, verifyHandoverOtp)
router.post('/:id/accept',     authenticate, acceptItem)
router.post('/:id/dispute',    authenticate, uploadDisputeEvidence.array('evidence', 4), openSecondHandDispute)

// ─── DISPUTE RESPONSE ─────────────────────────────
router.post('/disputes/:id/respond', authenticate, uploadDisputeEvidence.array('counterEvidence', 4), sellerRespondToDispute)

// ─── DEAL FLOW ────────────────────────────────────
router.post('/buy',              authenticate, dealBuy)
router.get('/seller/pending',    authenticate, getSellerPending)
router.get('/status/:id',        authenticate, getTransactionStatus)
router.get('/order/:id',         authenticate, getOrderById)

module.exports = router