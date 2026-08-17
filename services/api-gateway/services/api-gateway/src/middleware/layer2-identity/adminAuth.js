'use strict'
const jwt = require('jsonwebtoken')
module.exports = function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if ((decoded.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    req.user = { ...decoded, id: decoded.userId ?? decoded.id }
    next()
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}
