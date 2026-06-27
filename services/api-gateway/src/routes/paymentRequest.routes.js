'use strict'
const express = require('express')
const router = express.Router()
const authenticate = require('../middleware/layer2-identity/auth')
const { createRequest, payRequest, getMyRequests, getIncomingRequests } = require('../controllers/paymentRequest.controller')

router.post('/', authenticate, createRequest)
router.post('/pay/:reference', authenticate, payRequest)
router.get('/mine', authenticate, getMyRequests)
router.get('/incoming', authenticate, getIncomingRequests)

module.exports = router
