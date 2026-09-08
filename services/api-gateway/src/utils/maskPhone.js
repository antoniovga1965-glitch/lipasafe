'use strict'
const maskPhone = (phone) => {
  if (!phone || phone.length < 6) return 'Someone'
  return phone.slice(0, 6) + '***' + phone.slice(-2)
}
module.exports = { maskPhone }
