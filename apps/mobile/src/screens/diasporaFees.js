// M-Pesa B2C charge bands
const MPESA_BANDS = [
  { min: 1000,   max: 2500,   fee: 29  },
  { min: 2501,   max: 3500,   fee: 52  },
  { min: 3501,   max: 5000,   fee: 69  },
  { min: 5001,   max: 7500,   fee: 87  },
  { min: 7501,   max: 10000,  fee: 115 },
  { min: 10001,  max: 15000,  fee: 167 },
  { min: 15001,  max: 20000,  fee: 197 },
  { min: 20001,  max: 35000,  fee: 278 },
  { min: 35001,  max: 200000, fee: 309 },
];

export function getMpesaFee(amount) {
  const band = MPESA_BANDS.find(b => amount >= b.min && amount <= b.max);
  return band ? band.fee : 0;
}

export function calcBreakdown(amountKes, platformCutPct) {
  const amount     = parseFloat(amountKes) || 0;
  const platFee    = Math.ceil(amount * (platformCutPct / 100));
  const mpesaFee   = getMpesaFee(amount);
  const grandTotal = amount + platFee + mpesaFee;
  return { amount, platFee, mpesaFee, grandTotal };
}

export function toForeignCurrency(kesAmount, rate) {
  if (!rate || rate === 0) return 0;
  return (kesAmount / rate).toFixed(2);
}

export const CURRENCY_SYMBOLS = {
  USD: '$', GBP: '£', EUR: '€', AED: 'AED', INR: '₹',
};
