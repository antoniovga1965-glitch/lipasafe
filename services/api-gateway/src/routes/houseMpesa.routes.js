'use strict'
const express = require('express')
const router  = express.Router()
const auth = require('../middleware/layer2-identity/auth')
const { initiateHousePayment, houseMpesaCallback } = require('../controllers/houseMpesa.controller')
const { houseB2cResult, houseB2cTimeout }          = require('../controllers/houseB2cCallback.controller')

// Buyer-facing
router.post('/pay',      auth, initiateHousePayment)

// Safaricom callbacks — no auth, IP-whitelisted at nginx
router.post('/callback',     houseMpesaCallback)
router.post('/b2c/result',   houseB2cResult)
router.post('/b2c/timeout',  houseB2cTimeout)

module.exports = router
