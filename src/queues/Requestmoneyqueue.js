'use strict'

const { Queue } = require('bullmq')
const logger    = require('../utils/logger')

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT  || '6379'),
}

const requestMoneyQueue = new Queue('request-money', {
  connection,
  defaultJobOptions: {
    attempts:          3,
    backoff:           { type: 'exponential', delay: 5_000 },
    removeOnComplete:  100,
    removeOnFail:      200,
  },
})

requestMoneyQueue.on('error', (err) => {
  logger.error('requestMoney queue error', { err: err.message })
})

module.exports = requestMoneyQueue