const fs = require('fs');
const crypto = require('crypto');

const password = process.env.B2C_INITIATOR_PASSWORD; 
const cert = fs.readFileSync('./ProductionCertificate.cer', 'utf8');

const buffer = Buffer.from(password, 'utf8');
const encrypted = crypto.publicEncrypt(
  { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
  buffer
);

console.log(encrypted.toString('base64'));



