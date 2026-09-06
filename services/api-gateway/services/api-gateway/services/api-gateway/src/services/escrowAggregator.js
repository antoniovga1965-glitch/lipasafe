const { Prisma } = require('@prisma/client');
const { calcFeesBuyerSide, calcFeesFundi, calcFeesDelivery } = require('../utils/feeCalculator');
const prisma = require('../utils/prisma');

const TX_HELD_STATES = ['held', 'delivered', 'confirmed', 'disputed', 'resolved', 'releasing', 'payout_pending'];
const HOUSE_HELD     = ['PAYMENT_HELD', 'CONFIRMED', 'DISPUTED', 'ESCALATED'];
const CUSTOM_HELD    = ['PAYMENT_HELD', 'BUYER_CONFIRMED', 'DISPUTED', 'PAYMENT_MISMATCH', 'RELEASING_FUNDS'];
const ORDER_HELD     = ['HELD', 'DISPUTED'];

async function getTotalEscrowHeld(userId) {
  const [bundlesAndSecondHand, fundiRows, deliveryRows, houseRows, customRows, orderAgg] = await Promise.all([
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { buyerId: userId, category: { in: ['bundles', 'second_hand'] }, state: { in: TX_HELD_STATES } },
    }),
    prisma.fundiEscrow.findMany({
      where: { status: 'held', job: { buyerId: userId } },
      select: { amount: true },
    }),
    prisma.deliveryEscrow.findMany({
      where: { status: 'held', order: { buyerId: userId } },
      select: { amount: true },
    }),
    prisma.houseEscrow.findMany({
      where: { buyerId: userId, status: { in: HOUSE_HELD } },
      select: { amount: true },
    }),
    prisma.customEscrow.findMany({
      where: { buyerId: userId, status: { in: CUSTOM_HELD } },
      select: { amount: true },
    }),
    prisma.order.aggregate({
      _sum: { buyerTotal: true },
      where: { buyerId: userId, state: { in: ORDER_HELD } },
    }),
  ]);

  let total = new Prisma.Decimal(0).plus(bundlesAndSecondHand._sum.amount || 0);

  for (const row of fundiRows) {
    total = total.plus(calcFeesFundi(new Prisma.Decimal(row.amount)).buyerTotal);
  }
  for (const row of deliveryRows) {
    total = total.plus(calcFeesDelivery(new Prisma.Decimal(row.amount)).buyerTotal);
  }
  for (const row of houseRows) {
    total = total.plus(calcFeesBuyerSide(new Prisma.Decimal(row.amount)).buyerTotal);
  }
  for (const row of customRows) {
    total = total.plus(calcFeesBuyerSide(new Prisma.Decimal(row.amount)).buyerTotal);
  }

  total = total.plus(orderAgg._sum.buyerTotal || 0);

  return total.toFixed(2);
}

module.exports = { getTotalEscrowHeld };
