'use strict'
const router       = require('express').Router()
const authenticate = require('../middleware/layer2-identity/auth')

const { accept, decline, cancel, getTransfer, listTransfers, deleteTransfer } = require('../../controllers/transfer.controller')
const { initiateSafeSend, safeSendStatus }                   = require('../../controllers/transferMpesa.controller')

// Authenticated
router.get('/',                    authenticate, listTransfers)
router.get('/status/:checkoutId',  authenticate, safeSendStatus)
router.post('/initiate',           authenticate, initiateSafeSend)
router.post('/:id/accept',      authenticate, accept)
router.post('/:id/decline',     authenticate, decline)
router.post('/:id/cancel',      authenticate, cancel)
router.get('/:id',              authenticate, getTransfer)
router.delete('/:id',           authenticate, deleteTransfer)

module.exports = router
