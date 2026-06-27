'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const {
  initiateDeliveryPayment,
  deliveryMpesaCallback,
  pollDeliveryPaymentStatus,
} = require('../controllers/deliveryMpesa.controller')
const { deliveryB2cResult, deliveryB2cTimeout } = require('../controllers/deliveryB2cCallback.controller')

router.post('/pay',                      auth, initiateDeliveryPayment)
router.post('/callback',                 deliveryMpesaCallback)
router.get('/status/:checkoutRequestId', auth, pollDeliveryPaymentStatus)

// Safaricom B2C callbacks — no auth
router.post('/b2c/result',  deliveryB2cResult)
router.post('/b2c/timeout', deliveryB2cTimeout)

module.exports = router
