'use strict'
const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { register, verifyOtp, setPin, login, forgotPin, resetPin,logout, requestPinChangeOtp, verifyPinChangeOtp, confirmPinChange } = require('../controllers/auth.controller')
const authMiddleware = require('../middleware/layer2-identity/auth')

router.post('/register', register)
router.post('/verify-otp', verifyOtp)
router.post('/set-pin', setPin)
router.post('/login', login)
router.post('/forgot-pin', forgotPin)
router.post('/reset-pin', resetPin)
router.post('/logout', logout)
router.post('/change-pin/request-otp', authMiddleware, requestPinChangeOtp)
router.post('/change-pin/verify-otp', authMiddleware, verifyPinChangeOtp)
router.post('/change-pin/confirm', authMiddleware, confirmPinChange)

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token' })
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET || process.env.JWT_SECRET + '_refresh'
    )
    const accessToken = jwt.sign(
      { userId: decoded.userId, phone: decoded.phone, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )
   return res.json({ success: true, accessToken })
  } catch {
   return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' })
  }
})

module.exports = router
