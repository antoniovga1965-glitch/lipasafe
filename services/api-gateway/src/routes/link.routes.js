'use strict'
const express = require('express')
const router  = express.Router()
const { getLinkOrder, submitEvidence } = require('../controllers/link.controller')

router.get('/:ref', getLinkOrder)
router.post('/:ref/evidence', submitEvidence)

module.exports = router
