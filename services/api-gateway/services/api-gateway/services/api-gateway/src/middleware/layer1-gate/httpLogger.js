'use strict'
const logger = require('../../utils/logger')

module.exports = function httpLogger(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - ${req.ip}`
    if (res.statusCode >= 500) logger.error(msg)
    else if (res.statusCode >= 400) logger.warn(msg)
    else logger.info(msg)
  })
  next()
}
