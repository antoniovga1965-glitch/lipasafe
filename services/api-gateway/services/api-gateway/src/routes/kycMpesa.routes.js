'use strict'
const router = require('express').Router()
const auth   = require('../middleware/layer2-identity/auth')
const safaricomOnly = require('../middleware/layer1-gate/safaricomOnly')
const { initiateKycPayment, kycMpesaCallback, pollKycPayment } = require('../../controllers/kycMpesa.controller')

router.post('/pay',                    auth, initiateKycPayment)
router.post('/callback',               safaricomOnly, kycMpesaCallback)
router.get('/status/:checkoutRequestId', auth, pollKycPayment)

module.exports = router
