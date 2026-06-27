

'use strict'
const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')
const logger = require('./logger')

const SANDBOX_CERT    = path.join(__dirname, '../certs/sandbox.cer')
const PROD_CERT       = path.join(__dirname, '../certs/production.cer')

function getB2CCredential () {
  const isProduction = process.env.NODE_ENV === 'production'
  const certPath     = isProduction ? PROD_CERT : SANDBOX_CERT
  const password     = process.env.B2C_INITIATOR_PASSWORD

  // ── 1. Guard: catch missing env vars early, never default passwords ──
  if (!password) {
    throw new Error(
      '[getB2CCredential] B2C_INITIATOR_PASSWORD is not set in environment. ' +
      'Add it to your .env file.'
    )
  }

  // ── 2. Guard: catch missing cert file with actionable message ──
  if (!fs.existsSync(certPath)) {
    throw new Error(
      `[getB2CCredential] Cert file not found: ${certPath}\n` +
      'Download from Safaricom Daraja portal and place in src/certs/'
    )
  }

  // ── 3. Read cert buffer ──
  const certBuffer = fs.readFileSync(certPath)

  // ── 4. THE FIX: Extract public key FROM the certificate ──
 
  let publicKey
  try {
    const x509 = new crypto.X509Certificate(certBuffer)
    publicKey  = x509.publicKey
  } catch (err) {
    throw new Error(
      `[getB2CCredential] Failed to parse certificate at ${certPath}.\n` +
      `OpenSSL error: ${err.message}\n` +
      'Ensure the cert is valid PEM or DER format.'
    )
  }

  // ── 5. Encrypt with extracted public key ──
  let encrypted
  try {
    encrypted = crypto.publicEncrypt(
      {
        key:     publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(password, 'utf8')
    )
  } catch (err) {
    throw new Error(
      `[getB2CCredential] Encryption failed: ${err.message}`
    )
  }

  const credential = encrypted.toString('base64')
  logger.info('[getB2CCredential] B2C SecurityCredential generated successfully')
  return credential
}

module.exports = { getB2CCredential }