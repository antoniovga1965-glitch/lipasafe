'use strict'

const axios  = require('axios')
const logger = require('./logger')
const { getToken } = require('./mpesaToken')

const baseURL = process.env.MPESA_ENV === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke'

const normalizePhone = (phone) => {
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0'))   return '254' + p.slice(1)
  if (p.startsWith('+'))   return p.slice(1)
  return p
}

const getTimestamp = () => {
  const now = new Date()
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  )
}

/**
 * Initiate an STK push (M-Pesa Express / Lipa Na M-Pesa Online).
 *
 * @param {object}        opts
 * @param {string}        opts.phone          
 * @param {number}        opts.amount        
 * @param {string}        opts.accountRef   
 * @param {string}        opts.description   
 * @param {string}        [opts.callbackURL] 
 *
 * @returns {Promise<{ CheckoutRequestID, MerchantRequestID, ResponseCode, ResponseDescription, CustomerMessage }>}
 */
const initiateSTK = async ({ phone, amount, accountRef, description, callbackURL }) => {
  const token     = await getToken()
  const shortcode = process.env.MPESA_SHORTCODE
  const passkey   = process.env.MPESA_PASSKEY
  const timestamp = getTimestamp()
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')
  const normalized = normalizePhone(phone)

  const payload = {
    BusinessShortCode: shortcode,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.round(amount),
    PartyA:            normalized,
    PartyB:            shortcode,
    PhoneNumber:       normalized,
    CallBackURL:       callbackURL || process.env.MPESA_REQUEST_MONEY_STK_CALLBACK_URL,
    AccountReference:  (accountRef  || 'LipaSafe').slice(0, 12),
    TransactionDesc:   (description || 'Payment').slice(0, 13),
  }

  logger.info('STK push initiating', { phone: normalized, amount, accountRef })

  const res = await axios.post(
    `${baseURL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 }
  )

  if (res.data.ResponseCode !== '0') {
    throw new Error(`STK push failed: ${res.data.ResponseDescription}`)
  }

  logger.info('STK push initiated', {
    checkoutRequestId: res.data.CheckoutRequestID,
    phone: normalized,
    amount,
  })

  return res.data
}

module.exports = { initiateSTK }
