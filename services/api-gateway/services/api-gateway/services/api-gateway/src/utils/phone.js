'use strict'

const normalizePhone = (phone) => {
  if (!phone) return null
  const p = phone.toString().trim().replace(/\s+/g, '')
  
  if (p.startsWith('+254')) return p.slice(1)
  if (p.startsWith('0')) return '254' + p.slice(1)
  if (p.startsWith('254')) return p
  
  // Assume bare digits
  if (p.length === 9) return '254' + p
  return p
}


const isValidKenyaPhone = (phone) => {
  const normalized = normalizePhone(phone)
  return /^254[17]\d{8}$/.test(normalized)
}

module.exports = {
  normalizePhone,
  isValidKenyaPhone,
}