const crypto = require('crypto');
const fs = require('fs');

const cert = fs.readFileSync('./src/certs/sandbox.cer', 'utf8');

const encrypt = (pwd) => crypto.publicEncrypt(
  { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from(pwd)
).toString('base64');

console.log('B2B:', encrypt('Safaricom999!'));
console.log('B2C:', encrypt('Safaricom999!'));
