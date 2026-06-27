'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const { createRequest, payRequest, rejectRequest, cancelRequest, getRequest } = require('../controllers/Requestmoney.controler')

router.post('/',               auth, createRequest)
router.post('/:id/pay',        auth, payRequest)
router.post('/:id/reject',     auth, rejectRequest)
router.post('/:id/cancel',     auth, cancelRequest)
router.get('/:id',             auth, getRequest)

module.exports = router
