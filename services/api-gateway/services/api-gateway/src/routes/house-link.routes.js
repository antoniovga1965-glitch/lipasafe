'use strict'
const express = require('express')
const router  = express.Router()
const {
  getHouseLinkEscrow,
  acceptHouseDealPublic,
  rejectHouseDealPublic,
} = require('../../controllers/house.controller')
// Public — no auth. Ghost sellers reach this via SMS link, no app/login required.
// Accept/Reject require phone confirmation in body + are rate-limited .
router.get('/:escrowId',            getHouseLinkEscrow)
router.post('/:escrowId/accept',    acceptHouseDealPublic)
router.post('/:escrowId/reject',    rejectHouseDealPublic)
module.exports = router
