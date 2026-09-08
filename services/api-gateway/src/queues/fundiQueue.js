'use strict'
const { Queue } = require('bullmq')
const { redisConnection } = require('../utils/redis')

const fundiQueue = new Queue('fundi', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 500 },
  },
})

module.exports = fundiQueue
