'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const adminAuth = require('../middleware/layer2-identity/adminAuth')
const { escrowCreateLimiter } = require('../middleware/layer1-gate/rateLimiter')

const {
  createCustomEscrow,
  acceptDeal,
  rejectDeal,
  getCustomEscrow,
  deleteEscrow,
  getMyBuyerDeals,
  getMyCounterpartyDeals,
  buyerConfirmDeal,
  counterpartyConfirmDeal,
  openDispute,
  sellerDisputeRespond,
  adminResolveDispute,
} = require('../../controllers/customEscrow.controller')

const { initiateCustomPayment, customMpesaCallback } = require('../../controllers/customMpesa.controller')
const { uploadCustomEscrowPhotos, uploadDisputeEvidence } = require('../utils/cloudinary')
const { customB2cResult, customB2cTimeout }          = require('../../controllers/customB2cCallback.controller')

// Deal lifecycle
router.post('/',                         auth, escrowCreateLimiter, uploadCustomEscrowPhotos.array('photos', 10), createCustomEscrow)
router.post('/:escrowId/accept',         auth, acceptDeal)
router.post('/:escrowId/reject',         auth, rejectDeal)
router.post('/:escrowId/pay',            auth, initiateCustomPayment)
router.post('/:escrowId/buyer-confirm',  auth, buyerConfirmDeal)
router.post('/:escrowId/seller-confirm', auth, counterpartyConfirmDeal)
router.post('/:escrowId/dispute',         auth, uploadDisputeEvidence.array('evidence', 4), openDispute)
router.post('/:escrowId/dispute/respond', auth, uploadDisputeEvidence.array('evidence', 4), sellerDisputeRespond)

// Queries
router.get('/my/buyer',        auth, getMyBuyerDeals)
router.get('/my/counterparty', auth, getMyCounterpartyDeals)
router.get('/:escrowId',       auth, getCustomEscrow)

// Admin
router.post('/:escrowId/resolve', adminAuth, adminResolveDispute)

// M-Pesa webhooks 
router.post('/mpesa/callback',  customMpesaCallback)
router.post('/b2c/result',      customB2cResult)
router.post('/b2c/timeout',     customB2cTimeout)

router.delete('/:escrowId', auth, deleteEscrow)
module.exports = router
