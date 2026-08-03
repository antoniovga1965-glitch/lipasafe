'use strict'
const express = require('express')
const router = express.Router()
const auth = require('../middleware/layer2-identity/auth')
const { sendLimiter, checkPhoneLimiter } = require('../middleware/layer1-gate/rateLimiter')
const { getBalance, checkPhone, sendMoney, recallMoney, getTransactions, deleteWalletTransaction } = require('../../controllers/wallet.controller')

// All wallet routes require auth
router.use(auth)

router.get('/balance', getBalance)
router.get('/check-phone/:phone', checkPhoneLimiter, checkPhone)
router.post('/send', sendLimiter, sendMoney)
router.post('/recall/:reference', recallMoney)
router.get('/transactions', getTransactions)

router.delete('/transactions/:id', deleteWalletTransaction)

module.exports = router
