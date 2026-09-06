// 'use strict'
// const axios  = require('axios')
// const redis  = require('./redis')
// const logger = require('./logger')

// const TOKEN_CACHE_KEY = 'mpesa:access_token'
// const baseURL = process.env.MPESA_ENV === 'sandbox'
//   ? 'https://sandbox.safaricom.co.ke'
//   : 'https://api.safaricom.co.ke'

// const getToken = async () => {
//   try {
//     const cached = await redis.get(TOKEN_CACHE_KEY)
//     if (cached) return cached
//   } catch (e) {
//     logger.warn('[mpesaToken] Redis unavailable, fetching fresh token')
//   }

//   const auth = Buffer.from(
//     `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
//   ).toString('base64')

//   const res = await axios.get(
//     `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
//     { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
//   )

//   const { access_token, expires_in } = res.data
//   if (!access_token) throw new Error('Failed to obtain M-Pesa access token')

//   const ttl = expires_in ? expires_in - 60 : 3300
//   try {
//     await redis.setex(TOKEN_CACHE_KEY, ttl, access_token)
//   } catch (e) {}

//   return access_token
// }

// module.exports = { getToken, baseURL }


'use strict'
const axios  = require('axios')
const redis  = require('./redis')
const logger = require('./logger')

const TOKEN_CACHE_KEY = 'mpesa:access_token'
const LOCK_KEY         = 'mpesa:token:lock'
const LOCK_TTL_SEC     = 10          
const LOCK_RETRY_MS    = 200        
const LOCK_MAX_WAIT_MS = 8000        

const baseURL = process.env.MPESA_ENV === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


const acquireLock = async (token) => {
  try {
    const res = await redis.set(LOCK_KEY, token, 'EX', LOCK_TTL_SEC, 'NX')
    return res === 'OK'
  } catch (e) {
    logger.warn('[mpesaToken] Redis unavailable while acquiring lock: %s', e.message)
    return null // null = "redis down", distinct from false = "lock held by someone else"
  }
}

const releaseLock = async (token) => {
  try {
    // Only release if we still own it (avoid deleting someone else's lock
    // if ours already expired and was re-acquired).
    const current = await redis.get(LOCK_KEY)
    if (current === token) {
      await redis.del(LOCK_KEY)
    }
  } catch (e) {
    logger.warn('[mpesaToken] Redis unavailable while releasing lock: %s', e.message)
  }
}

const fetchTokenFromSafaricom = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64')

  const res = await axios.get(
    `${baseURL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
  )

  const { access_token, expires_in } = res.data
  if (!access_token) throw new Error('Failed to obtain M-Pesa access token')

  const ttl = expires_in ? expires_in - 60 : 3300 // refresh 60s before real expiry
  try {
    await redis.setex(TOKEN_CACHE_KEY, ttl, access_token)
  } catch (e) {
    logger.warn('[mpesaToken] Failed to cache token in Redis: %s', e.message)
  }

  return access_token
}

const getToken = async () => {
  // 1. Fast path: cache hit.
  try {
    const cached = await redis.get(TOKEN_CACHE_KEY)
    if (cached) return cached
  } catch (e) {
    logger.warn('[mpesaToken] Redis unavailable on read, falling back to direct fetch: %s', e.message)
    // Redis itself is down — no point trying to lock. Just fetch directly.
    return fetchTokenFromSafaricom()
  }

  // 2. Cache miss: try to become the one process that fetches a fresh token.
  const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const waitDeadline = Date.now() + LOCK_MAX_WAIT_MS

  while (true) {
    const acquired = await acquireLock(lockToken)

    if (acquired === null) {
      // Redis went down mid-flight. Don't spin waiting on a lock that
      // may never resolve — just fetch directly.
      return fetchTokenFromSafaricom()
    }

    if (acquired) {
      try {
        // Double-check: another process may have populated the cache
        // between our failed cache read and acquiring the lock.
        const cachedAfterLock = await redis.get(TOKEN_CACHE_KEY).catch(() => null)
        if (cachedAfterLock) return cachedAfterLock

        return await fetchTokenFromSafaricom()
      } finally {
        await releaseLock(lockToken)
      }
    }

    // Someone else holds the lock. Wait and re-check the cache — the
    // lock holder should populate it shortly.
    if (Date.now() >= waitDeadline) {
      logger.warn('[mpesaToken] Timed out waiting for token lock, fetching directly')
      return fetchTokenFromSafaricom()
    }

    await sleep(LOCK_RETRY_MS)

    try {
      const cachedWhileWaiting = await redis.get(TOKEN_CACHE_KEY)
      if (cachedWhileWaiting) return cachedWhileWaiting
    } catch (e) {
      // ignore, loop will retry lock acquisition
    }
  }
}

module.exports = { getToken, baseURL }