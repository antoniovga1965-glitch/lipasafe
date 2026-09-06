'use strict'
const prisma                     = require('../utils/prisma')
const logger                     = require('../utils/logger')
const { FLOAT_ID }               = require('../utils/diasporaConstants')
const { calcFeesDiaspora }       = require('../utils/feeCalculator')
const { initiateB2C }            = require('../utils/mpesaB2C')
const { credit: creditPlatform } = require('../utils/platformWallet')
const { sendSMSSafe }            = require('../services/smsService')
const { createAndSend }          = require('../services/notificationService')

/**
 * Atomically release a diaspora milestone. Shared by releaseFunds controller
 * and diasporaAutoReleaseWorker — auth/ownership checks stay in the caller,
 * this only handles the money-moving invariants.
 */
const executeDiasporaRelease = async ({ dealId, milestoneId, releasedBy }) => {
  const deal = await prisma.diasporaDeal.findUnique({
    where:   { id: dealId },
    include: { milestones: true }
  })
  if (!deal) return { success: false, code: 'NOT_FOUND', message: 'Deal not found' }

  const milestone = deal.milestones.find(m => m.id === milestoneId)
  if (!milestone) return { success: false, code: 'NOT_FOUND', message: 'Milestone not found' }

  if (milestone.status !== 'WORK_SUBMITTED')
    return { success: false, code: 'WRONG_STATE', message: `Milestone is ${milestone.status}, expected WORK_SUBMITTED` }

  const { platformFee, b2cCharge, workerReceives } = calcFeesDiaspora(milestone.amount)
  const totalDeduct = Number(workerReceives) + Number(b2cCharge)
  const floatRef     = `FPAY-${deal.reference}-M${milestone.order}`

  try {
    await prisma.$transaction(async (tx) => {
      const float = await tx.diasporaFloat.findUnique({ where: { id: FLOAT_ID } })
      if (!float || Number(float.balance) < totalDeduct)
        throw Object.assign(new Error('INSUFFICIENT_FLOAT'), { code: 'INSUFFICIENT_FLOAT', balance: float?.balance ?? 0, need: totalDeduct })

      // Idempotency lock — double-taps / duplicate jobs get count=0 and bail
      const locked = await tx.diasporaMilestone.updateMany({
        where: { id: milestoneId, status: 'WORK_SUBMITTED' },
        data:  { status: 'RELEASED', releasedAt: new Date(), releasedBy }
      })
      if (locked.count === 0)
        throw Object.assign(new Error('ALREADY_RELEASED'), { code: 'ALREADY_RELEASED' })

      const allReleased = deal.milestones.every(m => m.id === milestoneId ? true : m.status === 'RELEASED')
      await tx.diasporaDeal.update({
        where: { id: dealId },
        data:  { status: allReleased ? 'COMPLETED' : 'ACTIVE' }
      })

      await tx.diasporaFloat.update({
        where: { id: FLOAT_ID },
        data:  { balance: { decrement: totalDeduct }, lastUpdated: new Date() }
      })

      await tx.diasporaFloatTx.create({
        data: {
          floatId:     FLOAT_ID,
          type:        'B2C_PAYOUT',
          amount:      totalDeduct,
          reference:   floatRef,
          dealRef:     deal.reference,
          milestoneId: milestone.id,
          note:        `Worker: ${deal.recipientPhone} | receives: ${workerReceives} | B2C charge: ${b2cCharge}`
        }
      })

      // Platform fee — this was the missing piece; fee was being collected
      // from the buyer upfront but never credited to the platform wallet
      await creditPlatform(tx, Number(platformFee), `PF-${floatRef}`,
        `Diaspora platform fee — deal ${deal.reference} milestone M${milestone.order}`)
    })
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FLOAT')
      return { success: false, code: 'INSUFFICIENT_FLOAT', message: `Insufficient float. Need KES ${Number(err.need).toFixed(2)}, available KES ${Number(err.balance).toFixed(2)}` }
    if (err.code === 'ALREADY_RELEASED')
      return { success: false, code: 'ALREADY_RELEASED', message: 'Milestone already released — possible double-tap' }
    throw err
  }

  try {
    await initiateB2C({
      phone:         deal.recipientPhone,
      amount:        Number(workerReceives),
      originatorId:  floatRef,
      transactionId: floatRef,
      remarks:       `LipaSafe diaspora ${deal.reference}`
    })
    logger.info({ dealId, milestoneId, floatRef, workerReceives: Number(workerReceives) }, 'Diaspora B2C fired')
  } catch (b2cErr) {
    logger.error({ err: b2cErr.message, floatRef, milestoneId }, 'Diaspora B2C fire failed — needs manual retry')
  }

  const fundiUser = await prisma.user.findFirst({ where: { phone: deal.recipientPhone }, select: { id: true } })
  if (fundiUser) {
    await createAndSend({
      userId:         fundiUser.id,
      type:           'DIASPORA_FUNDS_RELEASED',
      messageEn:      `KES ${Number(milestone.amount).toLocaleString()} for "${milestone.title}" released. Ref: ${deal.reference}`,
      diasporaDealId: dealId,
      channel:        'push'
    }).catch(() => {})
  }
  await sendSMSSafe(deal.recipientPhone,
    `LipaSafe: KES ${Number(milestone.amount).toLocaleString()} for "${milestone.title}" released to your M-Pesa. Ref: ${deal.reference}`)

  logger.info({ dealId, milestoneId, floatRef, platformFee: Number(platformFee), b2cCharge: Number(b2cCharge) }, 'Diaspora milestone release complete')
  return { success: true, deal, milestone }
}

module.exports = { executeDiasporaRelease }
