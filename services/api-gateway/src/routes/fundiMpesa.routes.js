'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const {
  initiateFundiPayment,
  fundiMpesaCallback,
  pollFundiPaymentStatus,
} = require('../controllers/fundiMpesa.controller')
const { fundiB2cResult, fundiB2cTimeout } = require('../controllers/fundiB2cCallback.controller')

router.post('/pay',                          auth, initiateFundiPayment)
router.post('/callback',                     fundiMpesaCallback)
router.get('/status/:checkoutRequestId',     auth, pollFundiPaymentStatus)

// Safaricom B2C callbacks - no auth
router.post('/b2c/result',  fundiB2cResult)
router.post('/b2c/timeout', fundiB2cTimeout)

module.exports = router
