'use strict'
const { Queue } = require('bullmq')
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
}

const ghostWalletRecallQueue = new Queue('ghost-wallet-recall', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
  },
})

module.exports = ghostWalletRecallQueue
