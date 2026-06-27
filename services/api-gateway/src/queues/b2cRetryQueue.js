'use strict'
const { Queue } = require('bullmq')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

const b2cRetryQueue = new Queue('b2c-retry', {
  connection,
  defaultJobOptions: {
    attempts:  Number.MAX_SAFE_INTEGER,
    backoff: {
      type:  'exponential',
      delay: 5000,  
    },
    removeOnComplete: 100,
    removeOnFail:     false, 
  },
})

module.exports = b2cRetryQueue
