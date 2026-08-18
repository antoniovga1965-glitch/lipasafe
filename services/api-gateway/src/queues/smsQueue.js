'use strict'
const { Queue } = require('bullmq')
const logger = require('../utils/logger')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

const smsQueue = new Queue('sms', {
  connection,
  defaultJobOptions: {
    attempts: 5,                   
    backoff: {
      type: 'exponential',
      delay: 5000,                 
    },
    removeOnComplete: 100,         
    removeOnFail: 500,              
  }
})

smsQueue.on('error', (err) => {
  logger.error('SMS queue error', { err: err.message })
})

module.exports = smsQueue
