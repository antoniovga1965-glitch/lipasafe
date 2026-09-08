'use strict'
const router             = require('express').Router()
const { safeSendCallback } = require('../../controllers/transferMpesa.controller')

// Safaricom hits this — no auth, guarded by safaricomOnly in app.js
router.post('/callback', safeSendCallback)

module.exports = router
