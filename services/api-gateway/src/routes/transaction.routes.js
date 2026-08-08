'use strict'
const router = require('express').Router()
const auth   = require('../middleware/layer2-identity/auth')
const ctrl   = require('../../controllers/transaction.controller')

router.post('/bundle/initiate',       auth, ctrl.initiate)
router.get( '/bundle/status/:id',     auth, ctrl.pollBundleStatus)
router.post('/bundle/:id/confirm',    auth, ctrl.buyerConfirm)
router.post('/bundle/:id/dispute',    auth, ctrl.openDispute)
router.get( '/bundle/my',             auth, ctrl.getMyTransactions)

router.get( '/bundle/seller/pending', auth, ctrl.getSellerPendingOrders)
router.post('/bundle/:id/deliver',    auth, ctrl.sellerDeliver)
router.post('/bundle/:id/verify-otp', auth, ctrl.verifyOtp)
router.post('/bundle/:id/reject',     auth, ctrl.sellerReject)
router.post('/bundle/:id/rate',       auth, ctrl.rateSeller)

router.delete('/bundle/:id',          auth, ctrl.deleteTransaction)


module.exports = router
