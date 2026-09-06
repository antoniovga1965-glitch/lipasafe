'use strict'
const logger = require('../src/utils/logger')
const {
  openDispute,
  resolveDispute,
  comparePhotos,
  getDispute,
  getOpenDisputes,
} = require('../src/services/disputeService')

const open = async (req, res) => {
  
  try {
    const { orderId, claimerType, reason } = req.body
    const claimerId = req.user.userId
    if (!orderId || !claimerType || !reason) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' })
    }
    if (!['BUYER', 'DELIVERY_GUY'].includes(claimerType)) {
      return res.status(400).json({ success: false, message: 'Invalid claimerType.' })
    }
    const result = await openDispute({ orderId, claimerType, reason, claimerId })
    return res.json(result)
  } catch (e) {
    console.error(e)
    logger.error('open dispute error', { err: e.message })
    if (e.message.includes('already completed') || e.message.includes('already exists')) {
      return res.status(400).json({ success: false, message: e.message })
    }
    return res.status(400).json({ success: false, message: e.message })
  }
}

const resolve = async (req, res) => {
  try {
    const { disputeId, resolution, adminNotes } = req.body
    const adminId = req.user.userId
    logger.info('resolve body debug', { disputeId, resolution, adminNotes })
    if (!disputeId || !resolution) {
      return res.status(400).json({ success: false, message: 'Missing disputeId or resolution.' })
    }
    if (!['REFUND', 'PAY'].includes(resolution)) {
      return res.status(400).json({ success: false, message: 'Resolution must be REFUND or PAY.' })
    }
    const result = await resolveDispute({ disputeId, resolution, adminNotes, adminId })
    return res.json(result)
  } catch (e) {
    console.error(e)
    console.error(e)
    logger.error('resolve dispute error', { err: e.message })
    if (e.message.includes('already resolved') || e.message.includes('not found')) {
      return res.status(400).json({ success: false, message: e.message })
    }
    return res.status(400).json({ success: false, message: e.message })
  }
}

const compare = async (req, res) => {
  try {
    const { orderId } = req.params
    if (!orderId) return res.status(400).json({ success: false, message: 'Missing orderId.' })
    const result = await comparePhotos(orderId)
    return res.json({ success: true, ...result })
  } catch (e) {
    logger.error('compare photos error', { err: e.message })
    return res.status(400).json({ success: false, message: e.message })
  }
}

const getOne = async (req, res) => {
  try {
    const { disputeId } = req.params
    if (!disputeId) return res.status(400).json({ success: false, message: 'Missing disputeId.' })
    const result = await getDispute(disputeId)
    return res.json(result)
  } catch (e) {
    logger.error('get dispute error', { err: e.message })
    return res.status(400).json({ success: false, message: e.message })
  }
}

const getOpen = async (req, res) => {
  try {
    const { limit, offset } = req.query
    const result = await getOpenDisputes({ limit, offset })
    return res.json(result)
  } catch (e) {
    logger.error('get open disputes error', { err: e.message })
    return res.status(400).json({ success: false, message: e.message })
  }
}

module.exports = { open, resolve, compare, getOne, getOpen }
