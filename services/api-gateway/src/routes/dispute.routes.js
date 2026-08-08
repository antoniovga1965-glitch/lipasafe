'use strict'
const router = require('express').Router()
const auth   = require('../middleware/layer2-identity/auth')
const ctrl   = require('../../controllers/dispute.controller')

router.post('/open',                auth, ctrl.open)
router.get('/:disputeId',           auth, ctrl.getOne)
router.get('/',                     auth, ctrl.getOpen)
router.post('/:orderId/compare',    auth, ctrl.compare)

module.exports = router
