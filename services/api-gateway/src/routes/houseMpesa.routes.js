'use strict'
const express = require('express')
const router  = express.Router()
const auth = require('../middleware/layer2-identity/auth')
const safaricomOnly = require('../middleware/layer1-gate/safaricomOnly')
const { initiateHousePayment, houseMpesaCallback } = require('../../controllers/houseMpesa.controller')
const { houseB2cResult, houseB2cTimeout }          = require('../../controllers/houseB2cCallback.controller')

router.post('/pay',      auth, initiateHousePayment)

router.post('/callback',     safaricomOnly, houseMpesaCallback)
router.post('/b2c/result',   safaricomOnly, houseB2cResult)
router.post('/b2c/timeout',  safaricomOnly, houseB2cTimeout)

module.exports = router
