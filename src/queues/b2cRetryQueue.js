'use strict'
const { Queue } = require('bullmq')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

const b2cRetryQueue = new Queue('b2c-retry', {
  connection,
  defaultJobOptions: {
    attempts:  8,
    backoff: {
      type:  'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail:     500,
  },
})

module.exports = b2cRetryQueue
