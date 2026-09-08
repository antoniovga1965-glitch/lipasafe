'use strict'
const express    = require('express')
const router     = express.Router()
const auth       = require('../middleware/layer2-identity/auth')
const adminAuth  = require('../middleware/layer2-identity/staffAuth')
const { escrowCreateLimiter } = require('../middleware/layer1-gate/rateLimiter')

const {
  createDeal, submitProof, confirmDeposit, rejectDeposit,
  releaseMilestone,
  getFundiDeals, submitWorkProof, disputeMilestone, signUpload,
  getMyDeals, getDeal, adminGetPendingDeals,
  adminGetDisputes, resolveDispute, dismissDispute,
  requestRefundBankDetails, submitRefundBankDetails,
  getActivityLogs, adminGetAllDeals,
} = require('../../controllers/diaspora.controller')

const { getFloat, addFloat, floatStkCallback } = require("../../controllers/diasporaFloat.controller")
const { uploadDiasporaProof, uploadDiasporaWorkProof, uploadDiasporaRefPhotos } = require('../utils/cloudinary')

// Funder
router.post('/',                                               auth, escrowCreateLimiter, uploadDiasporaRefPhotos.array('referencePhotos', 3), createDeal)
router.get('/my-deals',                                        auth, getMyDeals)
router.get('/:id',                                             auth, getDeal)
router.post('/:id/proof',                                      auth, uploadDiasporaProof.single('proof'), submitProof)
router.post('/:id/milestones/:milestoneId/release',            auth, releaseMilestone)
router.post('/:id/milestones/:milestoneId/dispute',            auth, uploadDiasporaWorkProof.array('evidence', 10), disputeMilestone)

// Fundi (recipient)
router.get('/fundi/my-jobs',                                   auth, getFundiDeals)
router.post('/:id/milestones/:milestoneId/sign-upload',         auth, signUpload)
router.post('/:id/milestones/:milestoneId/submit-work',        auth, submitWorkProof)

// Secretary
router.get('/admin/pending',                                   adminAuth, adminGetPendingDeals)
router.get('/admin/float',                                     adminAuth, getFloat)
router.post('/admin/float/add',                                adminAuth, addFloat)
router.post('/mpesa/float/callback',                           floatStkCallback)
router.post('/:id/reject',                                     adminAuth, rejectDeposit)
router.post('/:id/confirm-deposit',  adminAuth, confirmDeposit)
router.get('/admin/disputes',                                  adminAuth, adminGetDisputes)
router.post('/admin/disputes/:disputeId/resolve',              adminAuth, resolveDispute)
router.delete('/admin/disputes/:disputeId/dismiss',            adminAuth, dismissDispute)
router.post('/admin/disputes/:disputeId/request-bank-details', adminAuth, requestRefundBankDetails)
router.post('/disputes/:disputeId/submit-bank-details',        auth,      submitRefundBankDetails)
router.get('/admin/logs',                                      adminAuth, getActivityLogs)
router.get('/admin/deals',                                     adminAuth, adminGetAllDeals)

module.exports = router
