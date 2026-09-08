'use strict'
const router        = require('express').Router()
const auth          = require('../middleware/layer2-identity/auth')
const secretaryAuth = require('../middleware/layer2-identity/secretaryAuth')
const ctrl          = require('../../controllers/secretary.controller')

// public — mobile fetches this without auth
router.get   ('/bank-details',    ctrl.getBankDetails)
router.get   ('/config',          ctrl.getConfig)

// protected
router.get   ('/settings',        auth, secretaryAuth, ctrl.getSettings)
router.patch ('/profile',         auth, secretaryAuth, ctrl.updateProfile)
router.patch ('/rates',           auth, secretaryAuth, ctrl.updateRates)
router.patch ('/cut',             auth, secretaryAuth, ctrl.updateCut)
router.patch ('/notifications',   auth, secretaryAuth, ctrl.updateNotifications)
router.patch ('/bank-details',    auth, secretaryAuth, ctrl.updateBankDetails)
router.get   ('/logs',            auth, secretaryAuth, ctrl.getLogs)

module.exports = router
