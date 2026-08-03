'use strict'
const Decimal = require('decimal.js')

const PLATFORM_RATE = new Decimal('0.02')

// Safaricom B2C payout charges (BusinessPayment tier, sandbox-equivalent)
function b2cCost(amount) {
  const a = Number(amount)
  if (a <=  100)  return 0
  if (a <=  500)  return 7
  if (a <= 1500)  return 13
  if (a <= 2500)  return 23
  if (a <= 3500)  return 33
  if (a <= 5000)  return 43
  if (a <= 7500)  return 53
  if (a <= 10000) return 63
  return 83 
}

// Safaricom B2B payout charges (Business Buy Goods / Till transfer tier)
// Free at or below KSh 200, then 0.55% of amount capped at KSh 200.
function b2bCost(amount) {
  const a = Number(amount)
  if (a <= 200) return 0
  return Math.min(Math.ceil(a * 0.0055), 200)
}

/**
 * Calculate fee breakdown for any escrow transaction.
 * @param {number|string|Decimal} grossAmount — what buyer pays
 * @returns {{ platformFee, b2cCost, totalFee, sellerReceives }} all as Decimal
 */
function calcFees(grossAmount) {
  const amount      = new Decimal(grossAmount)
  const rawFee      = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const platformFee = rawFee  
  const approxNet   = amount.minus(platformFee)
  const b2c         = new Decimal(b2cCost(approxNet))
  const totalFee    = platformFee.plus(b2c)
  const seller      = amount.minus(totalFee)
  return {
    platformFee:     platformFee,
    b2cCost:         b2c,
    totalFee:        totalFee,
    sellerReceives:  seller.greaterThan(0) ? seller : new Decimal(0),
  }
}

/**
 * Buyer-side fee calc — platform fee AND B2C cost both added ON TOP of deal amount.
 * Seller always receives the FULL agreed dealAmount, no deductions.
 * LipaSafe never eats the platform fee or B2C — buyer covers both, on top.
 * @param {number|string|Decimal} dealAmount — agreed deal value
 * @returns {{ platformFee, b2cCost, sellerReceives, buyerTotal }} all as Decimal
 */
function calcFeesBuyerSide(dealAmount) {
  const amount         = new Decimal(dealAmount)
  const rawPlatformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c            = new Decimal(b2cCost(amount))
  const rawTotal       = amount.plus(rawPlatformFee).plus(b2c)
  const buyerTotal     = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee    = buyerTotal.minus(amount).minus(b2c)
  return {
    platformFee,
    b2cCost:        b2c,
    sellerReceives: amount,
    buyerTotal,
  }
}
/**
 * SECOND-HAND ONLY fee calc — seller gets the FULL agreed item amount.
 * Buyer pays item + platform fee (2%) + B2C payout cost, all on top.
 * Independent from calcFees() — does not affect House/Delivery/Fundi/Transaction.
 * @param {number|string|Decimal} itemAmount — what seller agreed to receive
 * @returns {{ platformFee, b2cCost, totalFee, sellerReceives, buyerTotal }} all as Decimal
 */
function calcFeesSecondHand(itemAmount) {
  const amount         = new Decimal(itemAmount)
  const rawPlatformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c            = new Decimal(b2cCost(amount))
  const rawTotal       = amount.plus(rawPlatformFee).plus(b2c)
  const buyerTotal     = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee    = buyerTotal.minus(amount).minus(b2c)
  const totalFee       = platformFee.plus(b2c)
  return {
    platformFee:    platformFee,
    b2cCost:        b2c,
    totalFee:       totalFee,
    sellerReceives: amount,
    buyerTotal:     buyerTotal,
  }
}

/**
 * FUNDI ONLY fee calc — fundi gets the FULL agreed amount.
 * Buyer pays amount + platform fee (2%) + B2C payout cost, all on top.
 * buyerTotal is ceiled to whole KES (Safaricom STK push rejects decimals).
 * Any sub-shilling rounding fraction is absorbed into platformFee (revenue line) —
 * MUST mirror calcFeesFundi() in apps/mobile/src/utils/feeCalculator.js exactly.
 * Independent from calcFees()/calcFeesSecondHand() — kept separate per Fundi's own rules.
 * @param {number|string|Decimal} agreedAmount — what fundi agreed to receive
 * @returns {{ platformFee, b2cCost, totalFee, fundiReceives, buyerTotal }} all as Decimal
 */
function calcFeesFundi(agreedAmount) {
  const amount         = new Decimal(agreedAmount)
  const rawPlatformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c            = new Decimal(b2cCost(amount))
  const rawTotal       = amount.plus(rawPlatformFee).plus(b2c)
  const buyerTotal     = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee    = buyerTotal.minus(amount).minus(b2c)
  const totalFee       = platformFee.plus(b2c)
  return {
    platformFee:    platformFee,
    b2cCost:        b2c,
    totalFee:       totalFee,
    fundiReceives:  amount,
    buyerTotal:     buyerTotal,
  }
}

/**
 * DELIVERY ONLY fee calc — delivery guy gets the FULL agreed amount.
 * Buyer pays amount + platform fee (2%) + B2C payout cost, all on top.
 * Independent from calcFees() — does not affect House/SecondHand/Fundi/Transaction.
 * @param {number|string|Decimal} agreedAmount — what delivery guy agreed to receive
 * @returns {{ platformFee, b2cCost, totalFee, deliveryGuyReceives, buyerTotal }} all as Decimal
 */
function calcFeesDelivery(agreedAmount) {
  const amount         = new Decimal(agreedAmount)
  const rawPlatformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c            = new Decimal(b2cCost(amount))
  const rawTotal       = amount.plus(rawPlatformFee).plus(b2c)
  const buyerTotal     = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee    = buyerTotal.minus(amount).minus(b2c)
  const totalFee       = platformFee.plus(b2c)
  return {
    platformFee:          platformFee,
    b2cCost:              b2c,
    totalFee:             totalFee,
    deliveryGuyReceives:  amount,
    buyerTotal:           buyerTotal,
  }
}


/**
 * REQUEST MONEY ONLY fee calc — requester gets the FULL agreed amount.
 * Recipient pays amount + platform fee (2%) + B2C payout cost, all on top.
 * recipientPays is ceiled to whole KES (Safaricom STK push rejects decimals).
 * Any sub-shilling rounding fraction is absorbed into platformFee (revenue line) —
 * single source of truth: computed once at request creation, never recomputed on read.
 * Independent from calcFees()/calcFeesSecondHand()/calcFeesFundi() — kept separate per Request Money's own rules.
 * @param {number|string|Decimal} requestedAmount — what requester agreed to receive
 * @returns {{ amount, platformFee, b2cCost, totalFee, recipientPays }} all as Decimal
 */
function calcFeesRequestMoney(requestedAmount) {
  const amount          = new Decimal(requestedAmount)
  const rawPlatformFee  = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c             = new Decimal(b2cCost(amount))
  const rawTotal         = amount.plus(rawPlatformFee).plus(b2c)
  const recipientPays    = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee      = recipientPays.minus(amount).minus(b2c)
  const totalFee         = platformFee.plus(b2c)
  return {
    amount,
    platformFee,
    b2cCost:       b2c,
    totalFee,
    recipientPays,
  }
}

/**
 * INSTANT SEND fee calc — sender pays amount + platform fee (2%) + B2C charge, ceiled to whole KES.
 * Recipient receives the full agreed amount directly on M-Pesa via B2C.
 * @param {number|string|Decimal} sendAmount
 * @returns {{ platformFee, b2cCharge, totalDeduct }} all as Decimal
 */
function calcFeesInstantSend(sendAmount) {
  const amount         = new Decimal(sendAmount)
  const rawPlatformFee = amount.times(PLATFORM_RATE).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const b2c            = new Decimal(b2cCost(amount.toNumber()))
  const rawTotal       = amount.plus(rawPlatformFee).plus(b2c)
  const totalDeduct    = rawTotal.toDecimalPlaces(0, Decimal.ROUND_CEIL)
  const platformFee    = totalDeduct.minus(amount).minus(b2c)
  return { platformFee, b2cCharge: b2c, totalDeduct }
}

module.exports = { calcFeesInstantSend, calcFeesRequestMoney, calcFees, calcFeesBuyerSide, calcFeesSecondHand, calcFeesFundi, calcFeesDelivery, b2cCost, b2bCost, PLATFORM_RATE }
