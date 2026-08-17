'use strict'
const jwt = require('jsonwebtoken')
const redis  = require('../../utils/redis')
const logger = require('../../utils/logger')  

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }
  const token = authHeader.split(' ')[1]
  
  // Check blacklist FIRST
  redis.get(`blacklist:${token}`, (err, isBlacklisted) => {
    if (err) {
      logger.error('Redis error checking blacklist', { err })
      return res.status(500).json({ success: false, message: 'Auth error' })
    }
    
    if (isBlacklisted) {
      return res.status(401).json({ success: false, message: 'Token revoked' })
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = { ...decoded, id: decoded.userId ?? decoded.id }
      if (!req.user.id) throw new Error('MIDDLEWARE_BUG: req.user.id is undefined')
      next()
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' })
    }
  })
}