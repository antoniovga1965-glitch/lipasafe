'use strict'
const express = require('express')
const router  = express.Router()
const { handleInboundSMS } = require('../../controllers/smsInbound.controller')

// Africa's Talking posts form-encoded — no auth needed, AT signs with username
router.post('/inbound', express.urlencoded({ extended: false }), handleInboundSMS)

module.exports = router
