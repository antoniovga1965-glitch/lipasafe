'use strict'
const { recoverStuckPayouts } = require('../services/bundleService')
const logger = require('../utils/logger')

const run = async () => {
  try {
    await recoverStuckPayouts()
  } catch (err) {
    logger.error('recoverStuckPayouts cron crashed', { error: err.message, stack: err.stack })
  }
}

module.exports = { run }
