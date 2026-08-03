'use strict'
const logger = require('../../utils/logger')

// Only Safaricom servers can hit M-Pesa callback endpoints
// IPs from: https://developer.safaricom.co.ke/docs#ip-whitelist
const SAFARICOM_IPS = [
  '196.201.214.200', '196.201.214.206', '196.201.213.114',
  '196.201.214.207', '196.201.214.208', '196.201.213.44',
  '196.201.212.127', '196.201.212.138', '196.201.212.129',
  '196.201.212.136', '196.201.212.74',  '196.201.212.69',
]

const safaricomOnly = (req, res, next) => {
  // In sandbox mode allow all IPs (ngrok tunnels change IP constantly)
  if (process.env.MPESA_ENV === 'sandbox') return next()
  const ip = req.ip || req.connection.remoteAddress || ''
  const clean = ip.replace('::ffff:', '')
  if (SAFARICOM_IPS.includes(clean)) return next()
  logger.warn('Blocked non-Safaricom callback attempt', { ip: clean, url: req.originalUrl })
  return res.status(403).json({ success: false, message: 'Forbidden' })
}

module.exports = safaricomOnly
