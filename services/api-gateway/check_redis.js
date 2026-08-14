require('dotenv').config({ path: '/mnt/datassd/projects-and-docs/lipasafe/services/api-gateway/.env' })
const Redis = require('ioredis')
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
})
async function main() {
  const keys = await redis.keys('b2c_refund:*')
  console.log('Keys:', keys)
  for (const key of keys) {
    const val = await redis.get(key)
    console.log(key, JSON.parse(val))
  }
  redis.disconnect()
}
main().catch(console.error)
