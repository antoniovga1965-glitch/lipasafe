'use strict'
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')

// ─── GENERIC API LIMITER ──────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 3000000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  skip: (req) => req.path === '/health' || req.path.startsWith('/mpesa/status/'), 
})

// ─── AUTH LIMITER ─────────────────────────────────
// Login/register — prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' },
})

// ─── SEND MONEY LIMITER ───────────────────────────
// Tightest limit — financial action
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 56,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many send attempts. Wait a moment and try again.' },
})

// ─── CHECK PHONE LIMITER ──────────────────────────
// Prevent phone number enumeration attacks
const checkPhoneLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many lookup requests.' },
})

// ─── CUSTOM ESCROW CREATE LIMITER ──────────────────
// Caps damage from a leaked token / runaway script, not meant to stop a patient human (logs handle that)
const escrowCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many escrow creation attempts. Please slow down.' },
})

module.exports = { globalLimiter, authLimiter, sendLimiter, checkPhoneLimiter, escrowCreateLimiter }
