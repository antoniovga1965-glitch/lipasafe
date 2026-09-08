require('dotenv').config()
const AfricasTalking = require('africastalking')
const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
})
at.SMS.send({
  to: ['+254743560890'],
  message: 'LipaSafe live SMS test - pipe working',
}).then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error('FAILED:', e.message, e.response?.body))
