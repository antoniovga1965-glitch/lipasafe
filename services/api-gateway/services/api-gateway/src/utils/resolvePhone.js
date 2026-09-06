const prisma = require('./prisma')
const redis  = require('./redis')
const { normalizePhone } = require('./phone')

/**
 * Resolve a phone number to a LipaSafe registered user
 * Handles 07XX, 2547XX, +2547XX, and bare 7XX/1XX formats via normalizePhone()
 * Redis-cached for 5 minutes — safe since names rarely change
 */
const resolvePhone = async (rawPhone) => {
  if (!rawPhone) return { found: false, name: null, userId: null }

  const normalized = normalizePhone(rawPhone)
  if (!normalized) return { found: false, name: null, userId: null }

  const cacheKey = `resolve:phone:${normalized}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch (_) { /* Redis down — fall through to DB */ }

  const user = await prisma.user.findFirst({
    where:  { phone: { in: [rawPhone, normalized] } },
    select: { fullName: true, id: true }
  })

  const result = user
    ? { found: true,  name: user.fullName, userId: user.id }
    : { found: false, name: null,          userId: null     }

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300)
  } catch (_) { /* Redis down — no cache, not critical */ }

  return result
}

module.exports = { resolvePhone }
