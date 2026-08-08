'use strict'
const { Queue } = require('bullmq')
const logger = require('../utils/logger')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

const timerQueue = new Queue('bundle-timers', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  }
})

timerQueue.on('error', (err) => logger.error('Timer queue error', { err: err.message }))
module.exports = timerQueue
