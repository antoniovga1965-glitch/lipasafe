'use strict'
const express = require('express')
const router  = express.Router()
const auth      = require('../middleware/layer2-identity/auth')
const adminAuth = require('../middleware/layer2-identity/adminAuth')
const {
  createHouseEscrow,
  getHouseEscrowStatus,
  confirmHouseEscrow,
  disputeHouseEscrow,
  getMyHouseEscrows,
  getSellerHouseEscrows,

  deleteHouseEscrow,
  getHouseDisputes,
  resolveHouseDispute,
  acceptHouseDealAuth,
  rejectHouseDealAuth} = require('../../controllers/house.controller')
const { initiateHousePayment } = require('../../controllers/houseMpesa.controller')

router.post('/create',              auth, createHouseEscrow)
router.post('/pay',                 auth, initiateHousePayment)
router.get('/my-escrows',           auth, getMyHouseEscrows)
router.get('/status/:escrowId',     auth, getHouseEscrowStatus)
router.post('/confirm/:escrowId',   auth, confirmHouseEscrow)
router.post('/dispute/:escrowId',   auth, disputeHouseEscrow)
router.get('/seller/pending',       auth, getSellerHouseEscrows)
router.post('/accept/:escrowId',    auth, acceptHouseDealAuth)
router.post('/reject/:escrowId',    auth, rejectHouseDealAuth)

router.delete('/:id',              auth, deleteHouseEscrow)
router.get('/disputes',            adminAuth, getHouseDisputes)
router.post('/disputes/:disputeId/resolve', adminAuth, resolveHouseDispute)

module.exports = router
