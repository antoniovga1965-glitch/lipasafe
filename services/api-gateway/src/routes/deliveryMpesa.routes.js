'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const safaricomOnly = require('../middleware/layer1-gate/safaricomOnly')
const {
  initiateDeliveryPayment,
  deliveryMpesaCallback,
  pollDeliveryPaymentStatus,
} = require('../../controllers/deliveryMpesa.controller')
const { deliveryB2cResult, deliveryB2cTimeout } = require('../../controllers/deliveryB2cCallback.controller')

router.post('/pay',                      auth, initiateDeliveryPayment)
router.post('/callback',                 safaricomOnly, deliveryMpesaCallback)
router.get('/status/:checkoutRequestId', auth, pollDeliveryPaymentStatus)

router.post('/b2c/result',  safaricomOnly, deliveryB2cResult)
router.post('/b2c/timeout', safaricomOnly, deliveryB2cTimeout)

module.exports = router
