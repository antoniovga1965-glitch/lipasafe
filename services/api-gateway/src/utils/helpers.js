'use strict'
const crypto = require('crypto')

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const PLATFORM_FEE_RATE        = 0.02
const PAYMENT_EXPIRY_DELAY     = 30 * 60 * 1000
const DELIVERY_REMINDER_DELAY  = 10 * 60 * 1000
const SELLER_DELIVERY_DEADLINE = 30 * 60 * 1000
const AUTO_RELEASE_DELAY       = 20 * 60 * 1000
const DISPUTE_DEADLINE_DELAY   = 24 * 60 * 60 * 1000
const OTP_WINDOW               = 60 * 60 * 1000

// ─── UTILITIES ───────────────────────────────────────────────────────────────
const generateOtp = () => crypto.randomInt(100000, 1000000).toString()

const generateRef = () =>
  'LS' + Date.now().toString(36).toUpperCase() +
  Math.random().toString(36).slice(2, 5).toUpperCase()

const normalizePhone = (phone) => {
  let p = phone.trim().replace(/[\s\-\(\)]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('0'))  p = '254' + p.slice(1)
  if (!/^254[17]\d{8}$/.test(p)) throw new Error(`Invalid phone: ${phone}`)
  return p
}

const fromDecimal = (v) => {
  const Decimal = require('decimal.js')
  return new Decimal(v ? v.toString() : '0')
}

module.exports = {
  PLATFORM_FEE_RATE, PAYMENT_EXPIRY_DELAY, DELIVERY_REMINDER_DELAY,
  SELLER_DELIVERY_DEADLINE, AUTO_RELEASE_DELAY, DISPUTE_DEADLINE_DELAY, OTP_WINDOW,
  generateOtp, generateRef, normalizePhone, fromDecimal
}
