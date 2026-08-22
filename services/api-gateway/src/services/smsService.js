'use strict'
const logger = require('../utils/logger')
const AfricasTalking = require('africastalking')

// ── Phone normalization (single source of truth) ──────────────────────────
const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0'))    return '254' + p.slice(1)
  if (p.startsWith('254'))  return p
  return p
}

const validatePhone = (phone) => {
  if (!phone || phone.toString().startsWith('till_')) return null
  const n = normalizePhone(phone)
  return /^254\d{9}$/.test(n) ? n : null
}

// ── Providers ─────────────────────────────────────────────────────────────
const sendViaPhone = async (to, message) => {
  const res = await fetch(process.env.PHONE_GATEWAY_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone_number: `+${to}`, message }),
  })
  if (!res.ok) throw new Error(`Phone gateway error: ${res.status}`)
  logger.info('Phone gateway SMS sent', { to })
}

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
})

const sendViaAT = async (to, message) => {
  const isSandbox = process.env.AT_ENVIRONMENT === 'sandbox'
  const payload   = { to: [`+${to}`], message }
  if (!isSandbox && process.env.AT_SENDER_ID) payload.from = process.env.AT_SENDER_ID
  const result = await at.SMS.send(payload)
  logger.info('AT SMS sent', { to, result: result.SMSMessageData })
}

// ── Public API ─────────────────────────────────────────────────────────────
const sendSMS = async (phone, message) => {
  const normalized = validatePhone(phone)
  if (!normalized) {
    logger.warn('sendSMS skipped', { phone })
    return
  }
  const provider = process.env.SMS_PROVIDER || 'phone'
  return provider === 'africastalking'
    ? sendViaAT(normalized, message)
    : sendViaPhone(normalized, message)
}

const sendSMSSafe = async (phone, message) => {
  try { await sendSMS(phone, message) }
  catch (err) { logger.error('SMS failed (non-fatal)', { phone, error: err.message }) }
}

module.exports = { sendSMS, sendSMSSafe }
