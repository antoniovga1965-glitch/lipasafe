'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const safaricomOnly = require('../middleware/layer1-gate/safaricomOnly')
const {
  initiateFundiPayment,
  fundiMpesaCallback,
  pollFundiPaymentStatus,
} = require('../../controllers/fundiMpesa.controller')
const { fundiB2cResult, fundiB2cTimeout } = require('../../controllers/fundiB2cCallback.controller')

router.post('/pay',                          auth, initiateFundiPayment)
router.post('/callback',                     safaricomOnly, fundiMpesaCallback)
router.get('/status/:checkoutRequestId',     auth, pollFundiPaymentStatus)

router.post('/b2c/result',  safaricomOnly, fundiB2cResult)
router.post('/b2c/timeout', safaricomOnly, fundiB2cTimeout)

module.exports = router
