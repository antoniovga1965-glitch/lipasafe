'use strict'
const express = require('express')
const router  = express.Router()
const { handleStkCallback } = require('../../controllers/Requestmoneystkcallback')

router.post('/stk-callback', handleStkCallback)

module.exports = router
