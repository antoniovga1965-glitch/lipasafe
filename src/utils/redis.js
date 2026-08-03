'use strict'

const Redis = require('ioredis')

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000),
})

redis.on('error', (err) => console.error('Redis error:', err))
redis.on('connect', () => console.log('Redis connected'))

const redisConnection = { host: '127.0.0.1', port: 6379 }
module.exports = redis
module.exports.redisConnection = redisConnection

