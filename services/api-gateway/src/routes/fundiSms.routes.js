'use strict'
const express = require('express')
const router  = express.Router()


const { handleFundiInboundSMS } = require('../controllers/fundiSmsInbound.controller')

// Africa's Talking posts form-encoded — separate endpoint from main SMS
router.post('/inbound', express.urlencoded({ extended: false }), handleFundiInboundSMS)

module.exports = router
