'use strict'
const express = require('express')
const router  = express.Router()
const auth    = require('../middleware/layer2-identity/auth')
const { createOrder, getOrder, releaseOrder, disputeOrder } = require('../../controllers/order.controller')

router.post('/',              auth, createOrder)
router.get('/:ref',           auth, getOrder)
router.post('/:ref/release',  auth, releaseOrder)
router.post('/:ref/dispute',  auth, disputeOrder)

module.exports = router
