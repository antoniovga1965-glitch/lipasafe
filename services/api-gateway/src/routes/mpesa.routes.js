'use strict'
const express    = require('express')
const router     = express.Router()
const authenticate = require('../middleware/layer2-identity/auth')
const { stkPush, callback, pollStatus, receiveRequest } = require('../controllers/mpesa.controller')

router.post('/stk-push',                authenticate, stkPush)
router.post('/callback',                callback)
router.get('/status/:checkoutRequestId', authenticate, pollStatus)

router.post('/receive', authenticate, receiveRequest)
module.exports = router

const b2cCtrl = require('../controllers/mpesaB2cCallback.controller')
const b2bCtrl = require('../controllers/mpesaB2bCallback.controller')
router.post('/b2c/result',   b2cCtrl.b2cResult)
router.post('/b2c/timeout',  b2cCtrl.b2cTimeout)
router.post('/b2b/result',   b2bCtrl.b2bResult)
router.post('/b2b/timeout',  b2bCtrl.b2bTimeout)

const atCtrl = require('../controllers/atDelivery.controller')
router.post('/at/delivery', atCtrl.deliveryReport)
