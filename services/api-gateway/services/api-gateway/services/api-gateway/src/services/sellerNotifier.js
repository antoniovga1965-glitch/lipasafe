'use strict'
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')
const smsQueue = require('../queues/smsQueue')
const { createAndSend } = require('./notificationService')

const phoneVariants = (phone) => {
  const variants = [phone]
  if (phone.startsWith('254')) variants.push('0' + phone.slice(3))
  if (phone.startsWith('0'))   variants.push('254' + phone.slice(1))
  return variants
}

/**
 * notifySeller — single entry point for notifying a seller of escrow activity,
 * whether they have a LipaSafe account or are a ghost (no account yet).
 *
 * Registered seller → in-app Notification (push + socket) + light SMS heads-up.
 * Ghost seller       → SMS only, with app download CTA.
 *
 * @param {string} phone        - seller phone, any format
 * @param {string} type         - NotificationType enum value (e.g. 'payment_received')
 * @param {string} registeredSms - SMS text used when seller HAS an account
 * @param {string} ghostSms      - SMS text used when seller has NO account
 * @param {object} link          - { houseEscrowId } or { orderId }, whichever applies
 */
const notifySeller = async ({ phone, type, messageEn, registeredSms, ghostSms, houseEscrowId = null, orderId = null }) => {
  try {
    const variants = phoneVariants(phone)
    const seller = await prisma.user.findFirst({ where: { phone: { in: variants } }, select: { id: true } })

    if (seller) {
      await createAndSend({
        userId: seller.id,
        type,
        messageEn,
        channel: 'push',
        houseEscrowId,
        orderId,
      })
      await smsQueue.add('seller_notify_registered', {
        type:  'raw',
        phone,
        message: registeredSms,
      })
      logger.info('Seller notified — registered', { phone, type })
    } else {
      await smsQueue.add('seller_notify_ghost', {
        type:  'raw',
        phone,
        message: ghostSms,
      })
      logger.info('Seller notified — ghost (SMS only)', { phone, type })
    }
  } catch (err) {
    logger.error('notifySeller failed', { error: err.message, phone })
  }
}

module.exports = { notifySeller }
