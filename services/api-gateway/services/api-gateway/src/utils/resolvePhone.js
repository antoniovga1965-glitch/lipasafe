const prisma = require('./prisma')
const redis  = require('./redis')

/**
 * Resolve a phone number to a LipaSafe registered user
 * Handles both 07XX and 2547XX formats
 * Redis-cached for 5 minutes — safe since names rarely change
 */
const resolvePhone = async (rawPhone) => {
  if (!rawPhone) return { found: false, name: null, userId: null }

  const normalized = rawPhone.startsWith('0')
    ? '254' + rawPhone.slice(1)
    : rawPhone

  // ── Cache hit ──
  const cacheKey = `resolve:phone:${normalized}`
  try {
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)
  } catch (_) { /* Redis down — fall through to DB */ }

  // ── DB lookup (indexed on phone @unique) ──
  const user = await prisma.user.findFirst({
    where:  { phone: { in: [rawPhone, normalized] } },
    select: { fullName: true, id: true }
  })

  const result = user
    ? { found: true,  name: user.fullName, userId: user.id }
    : { found: false, name: null,          userId: null     }

  // ── Cache for 5 minutes ──
  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300)
  } catch (_) { /* Redis down — no cache, not critical */ }

  return result
}

module.exports = { resolvePhone }
