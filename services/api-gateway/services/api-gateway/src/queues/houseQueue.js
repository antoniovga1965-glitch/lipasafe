'use strict'
const { Queue } = require('bullmq')
const { redisConnection } = require('../utils/redis')

const houseQueue = new Queue('house', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 500 },
  },
})

module.exports = houseQueue
