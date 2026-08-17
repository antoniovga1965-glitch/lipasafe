'use strict'
const ctrl = require('../../controllers/admin.controller')
const orderCtrl = require('../../controllers/order.controller')

const router = require('express').Router()
const auth = require('../middleware/layer2-identity/auth')
const adminAuth = require('../middleware/layer2-identity/adminAuth')

router.get('/dashboard',           auth, adminAuth, ctrl.getDashboardStats)
router.get('/disputes',            auth, adminAuth, ctrl.getDisputes)
router.post('/disputes/:id/resolve', auth, adminAuth, ctrl.resolveDispute)
router.get('/transactions',        auth, adminAuth, ctrl.getTransactions)
router.get('/users',               auth, adminAuth, ctrl.getUsers)
router.patch('/users/:id/status',  auth, adminAuth, ctrl.updateUserStatus)

// ── Delivery disputes ──
router.get('/delivery-disputes',              auth, adminAuth, ctrl.getDeliveryDisputes)
router.post('/delivery-disputes/:id/resolve', auth, adminAuth, ctrl.resolveDeliveryDispute)

// ── Fundi disputes ──
router.get('/fundi-disputes',                  auth, adminAuth, ctrl.listFundiDisputes)
router.patch('/fundi-disputes/:jobId/resolve', auth, adminAuth, ctrl.resolveFundiDispute)

// ── Custom disputes ──
router.post('/custom-disputes/:id/resolve', auth, adminAuth, ctrl.resolveCustomDispute)

// ── House disputes ──
router.get('/house-disputes',                  auth, adminAuth, ctrl.listHouseDisputes)
router.patch('/house-disputes/:id/resolve',    auth, adminAuth, ctrl.resolveHouseDispute)

// ── KYC ──
router.get('/kyc/pending',                     auth, adminAuth, ctrl.listPendingKyc)
router.get('/audit-log',                       auth, adminAuth, ctrl.getAuditLog)
router.patch('/kyc/:id/resolve',               auth, adminAuth, ctrl.resolveKyc)

// ── User search ──
router.get('/users/search',                    auth, adminAuth, ctrl.searchUser)

// ── Order disputes ──
router.get('/order-disputes',                   auth, adminAuth, orderCtrl.listOrderDisputes)
router.post('/order-disputes/:disputeId/resolve', auth, adminAuth, orderCtrl.resolveOrderDispute)

// ── M-Pesa Health ──
router.get('/mpesa-health', auth, adminAuth, ctrl.getMpesaHealth)
router.get('/mpesa-logs',   auth, adminAuth, ctrl.getMpesaLogs)
module.exports = router
