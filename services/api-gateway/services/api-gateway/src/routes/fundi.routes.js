'use strict'
const express = require('express')
const router  = express.Router()

const authenticate = require('../middleware/layer2-identity/auth')
const adminAuth = require('../middleware/layer2-identity/adminAuth')
const {
  createJob,
  getJob,
  listMyJobs,
  markJobDone,
  approveJob,
  disputeJob,
  extendDeadline,
  requestExtension,
  extensionResponse,
  cancelJob,
  listSellerJobs,
  resendOtp,
  resolveDispute,
  acceptJob,
  deleteJob,
} = require('../workers/fundiWorker')
const { uploadFundiPhotos } = require('../utils/cloudinary')

router.post('/upload-photos', authenticate, uploadFundiPhotos.array('photos', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files uploaded' })
  const urls = req.files.map(f => f.path)
  return res.json({ success: true, urls })
})
router.post('/',                      authenticate, createJob)
router.get('/',                       authenticate, listMyJobs)
router.get('/:jobId',                 authenticate, getJob)
router.post('/:jobId/done',           authenticate, markJobDone)
router.post('/:jobId/approve',        authenticate, approveJob)
router.post('/:jobId/dispute',        authenticate, disputeJob)
router.post('/:jobId/extend',         authenticate, extendDeadline)
router.post('/:jobId/request-extension',  authenticate, requestExtension)
router.patch('/:jobId/extension-response', authenticate, extensionResponse)
router.post('/:jobId/cancel',         authenticate, cancelJob)
router.get('/seller/pending',          authenticate, listSellerJobs)

router.post('/:jobId/resend-otp', authenticate, resendOtp)

router.patch('/:jobId/resolve', adminAuth, resolveDispute)

router.post('/:jobId/accept', authenticate, acceptJob)

router.delete('/:jobId', authenticate, deleteJob)
module.exports = router
