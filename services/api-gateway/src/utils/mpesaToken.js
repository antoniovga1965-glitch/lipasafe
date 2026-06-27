'use strict'
const axios  = require('axios')
const redis  = require('./redis')
const logger = require('./logger')

const TOKEN_CACHE_KEY = 'mpesa:access_token'
const baseURL = process.env.MPESA_ENV === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke'

const getToken = async () => {
  try {
    const cached = await redis.get(TOKEN_CACHE_KEY)
    if (cached) return cached
  } catch (e) {
    logger.warn('[mpesaToken] Redis unavailable, fetching fresh token')
  }

  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64')

  const res = await axios.get(
    `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
  )

  const { access_token, expires_in } = res.data
  if (!access_token) throw new Error('Failed to obtain M-Pesa access token')

  const ttl = expires_in ? expires_in - 60 : 3300
  try {
    await redis.setex(TOKEN_CACHE_KEY, ttl, access_token)
  } catch (e) {}

  return access_token
}

module.exports = { getToken, baseURL }
