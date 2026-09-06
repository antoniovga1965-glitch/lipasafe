'use strict'
const axios  = require('axios')
const logger = require('./logger')
const { getToken } = require('./mpesaToken')

const baseURL = process.env.MPESA_ENV === 'sandbox'
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke'

const normalizePhone = (phone) => {
  if (!phone) throw new Error('Phone required for B2C')
  const p = phone.toString().replace(/\s+/g, '')
  if (p.startsWith('254')) return p
  if (p.startsWith('0'))   return '254' + p.slice(1)
  if (p.startsWith('+'))   return p.slice(1)
  return p
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Initiate a B2C payout to a phone number.
 * @param {object} opts
 * @param {string} opts.phone           
 * @param {string|number} opts.amount   
 * @param {string} opts.originatorId    
 * @param {string} opts.transactionId    
 * @param {string} opts.remarks         
 */
const initiateB2C = async ({ phone, amount, originatorId, transactionId, remarks }) => {
  const token           = await getToken()
  const normalizedPhone = normalizePhone(phone)
  let lastErr

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const payload = {
        OriginatorConversationID: originatorId,
        InitiatorName:            process.env.MPESA_B2C_INITIATOR_NAME,
        SecurityCredential:       process.env.MPESA_B2C_SECURITY_CREDENTIAL,
        CommandID:                'BusinessPayment',
        Amount:                   Math.round(amount),
        PartyA:                   process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE,
        PartyB:                   normalizedPhone,
        Remarks:                  remarks || `LipaSafe payout ${transactionId}`,
        QueueTimeOutURL:          process.env.MPESA_B2C_TIMEOUT_URL,
        ResultURL:                process.env.MPESA_B2C_RESULT_URL
      }
      logger.info('B2C REQUEST PAYLOAD', { ...payload, SecurityCredential: `${payload.SecurityCredential?.slice(0,10)}...len${payload.SecurityCredential?.length}` })
      const res = await axios.post(`${baseURL}/mpesa/b2c/v3/paymentrequest`, payload,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 })

      if (res.data.ResponseCode !== '0') {
        throw new Error(`B2C failed: ${res.data.ResponseDescription}`)
      }

      logger.info('B2C payout initiated', { phone: normalizedPhone, amount, transactionId, attempt })
      return res.data

    } catch (err) {
      // Duplicate OriginatorConversationID — Safaricom already processed it
      // This is PROOF OF PAYMENT, not an error. Treat as success.
      if (err.response?.data?.errorCode === '500.002.1001') {
        logger.warn('B2C duplicate — already processed, treating as success', { transactionId, attempt })
        return { ResponseCode: '0', ResponseDescription: 'Duplicate — already processed', OriginatorConversationID: originatorId }
      }
      lastErr = err
      logger.warn(`B2C attempt ${attempt} failed`, { transactionId, err: err.message, safaricomBody: err.response?.data })
      if (attempt < 3) await sleep(1000 * attempt)
    }
  }
  throw lastErr
}

module.exports = { initiateB2C }
