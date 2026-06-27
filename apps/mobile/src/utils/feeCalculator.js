

export const PLATFORM_RATE = 0.02

/**
 * Calculate platform fee for a given amount.
 * Matches backend feeCalculator.js logic exactly.
 * @param {number|string} amount
 * @returns {number} fee rounded to 2 decimal places
 */
export const calcFee = (amount) => {
  const parsed = parseFloat(amount) || 0
  return Math.round(parsed * PLATFORM_RATE * 100) / 100
}

/**
 * Calculate total buyer pays (amount + fee).
 * @param {number|string} amount
 * @returns {number}
 */
export const calcTotal = (amount) => {
  const parsed = parseFloat(amount) || 0
  return Math.round((parsed + calcFee(parsed)) * 100) / 100
}

/**
 * Calculate seller receives (amount - fee).
 * @param {number|string} amount
 * @returns {number}
 */
export const calcSellerReceives = (amount) => {
  const parsed = parseFloat(amount) || 0
  return Math.round((parsed - calcFee(parsed)) * 100) / 100
}

// Safaricom B2C BusinessPayment tiers (KES).
// MUST mirror b2cCost() in services/api-gateway/src/utils/feeCalculator.js exactly.
// If Safaricom pricing changes, update BOTH files.
const b2cCost = (amount) => {
  const a = Number(amount)
  if (a <= 100)   return 0
  if (a <= 500)   return 7
  if (a <= 1500)  return 13
  if (a <= 2500)  return 23
  if (a <= 3500)  return 33
  if (a <= 5000)  return 43
  if (a <= 7500)  return 53
  if (a <= 10000) return 63
  return 83
}

// Fundi flow: fundi receives full `amount`, buyer pays amount + platformFee + b2cCost.
// buyerTotal is ceiled to whole KES (Safaricom STK push rejects decimals).
// Any sub-shilling fraction is absorbed into platformFee (your revenue line).
export const calcFeesFundi = (amount) => {
  const parsed = parseFloat(amount) || 0
  const platformFee = Math.round(parsed * PLATFORM_RATE * 100) / 100
  const b2c = b2cCost(parsed)
  const rawTotal = parsed + platformFee + b2c
  const buyerTotal = Math.ceil(rawTotal)             // whole KES for STK push
  const adjustedPlatformFee = buyerTotal - parsed - b2c  // absorbs rounding fraction
  return {
    platformFee: adjustedPlatformFee,
    b2cCost: b2c,
    totalFee: adjustedPlatformFee + b2c,
    fundiReceives: parsed,
    buyerTotal,
  }
}

// Generic flow: used by Custom, Second-Hand, House, Delivery — seller/counterparty
// receives full `amount`, buyer pays amount + platformFee + b2cCost.
// buyerTotal is ceiled to whole KES (Safaricom STK push rejects decimals).
// Any sub-shilling fraction is absorbed into platformFee (your revenue line).
// Same logic as calcFeesFundi — kept as a separate named export for clarity at call sites.
export const calcFeesGeneric = (amount) => {
  const parsed = parseFloat(amount) || 0
  const platformFee = Math.round(parsed * PLATFORM_RATE * 100) / 100
  const b2c = b2cCost(parsed)
  const rawTotal = parsed + platformFee + b2c
  const buyerTotal = Math.ceil(rawTotal)             // whole KES for STK push
  const adjustedPlatformFee = buyerTotal - parsed - b2c  // absorbs rounding fraction
  return {
    platformFee: adjustedPlatformFee,
    b2cCost: b2c,
    totalFee: adjustedPlatformFee + b2c,
    sellerReceives: parsed,
    buyerTotal,
  }
}

// Instant Send: sender pays amount + platformFee(2%) + b2cCost, ceiled to whole KES.
// Recipient receives full amount directly on M-Pesa via B2C.
// Any sub-shilling rounding is absorbed into platformFee.
// MUST mirror calcFeesInstantSend() in services/api-gateway/src/utils/feeCalculator.js exactly.
export const calcFeesInstantSend = (amount) => {
  const parsed = parseFloat(amount) || 0
  const platformFee = Math.round(parsed * PLATFORM_RATE * 100) / 100
  const b2c = b2cCost(parsed)
  const rawTotal = parsed + platformFee + b2c
  const totalDeduct = Math.ceil(rawTotal)                   // whole KES, no decimals
  const adjustedPlatformFee = totalDeduct - parsed - b2c   // absorbs rounding into platform
  return {
    platformFee: adjustedPlatformFee,
    b2cCharge: b2c,
    totalDeduct,
  }
}
