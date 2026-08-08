'use strict'
const router     = require('express').Router()
const auth       = require('../middleware/layer2-identity/auth')
const { getKycStatus, submitDocs, listVerifiedSellers, trustedCheck, claimTrusted } = require('../../controllers/kyc.controller')

router.get('/status',        auth, getKycStatus)
router.post('/submit-docs',  auth, submitDocs)
router.get('/sellers',       listVerifiedSellers)  
router.get('/trusted-check', auth, trustedCheck)
router.post('/claim-trusted',  auth, claimTrusted)

module.exports = router
