'use strict'
const { Expo }       = require('expo-server-sdk')
const prisma         = require('../utils/prisma')
const logger         = require('../utils/logger')
const { emitToUser } = require('../utils/socket')

const expo = new Expo()


const createAndSend = async ({ 
  userId, type, messageEn, messageSw = null, 
  transactionId = null, 
  transferId = null,
  houseEscrowId = null, 
  orderId = null,
  requestId = null,
  deliveryOrderId = null,
  customEscrowId = null,
  channel = 'push' 
}) => {
  try {
    // 1. Save to DB
    const notif = await prisma.notification.create({
      data: { 
        userId, type, channel, messageEn, messageSw, 
        transactionId,
        transferId,
        houseEscrowId,    
        orderId,
        requestId,
        deliveryOrderId,
        customEscrowId,
        status: 'pending' 
      }
    })

    // 2. Real-time socket emit — instant in-app update
    emitToUser(userId, 'notification', {
      id: notif.id, type, messageEn, messageSw,
      createdAt: notif.createdAt, status: 'pending', 
      transactionId,
      transferId,
      houseEscrowId,       
      orderId,
      requestId,
      deliveryOrderId: notif.deliveryOrderId || null,
      customEscrowId: notif.customEscrowId || null,
    })

    // 3. Expo push — works even when app is closed
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { pushToken: true }
    })

    if (user?.pushToken && Expo.isExpoPushToken(user.pushToken)) {
      try {
        const chunks = expo.chunkPushNotifications([{
          to:    user.pushToken,
          sound: 'default',
          title: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          body:  messageEn,
          data:  { 
            notificationId: notif.id, 
            type, 
            transactionId, 
            transferId, 
            houseEscrowId, 
            requestId,
            deliveryOrderId: notif.deliveryOrderId || null,
            customEscrowId: notif.customEscrowId || null,
            screen: type === 'NEW_DELIVERY_ORDER'    ? 'MyDeliveries' :
                    type === 'BEFORE_PHOTO_UPLOADED' ? 'MyDeliveries' :
                    type === 'BEFORE_PHOTO_REJECTED' ? 'MyDeliveries' :
                    type === 'PICKUP_OTP_ISSUED'     ? 'MyDeliveries' :
                    type === 'DELIVERY_STARTED'      ? 'MyDeliveries' :
                    type === 'RECEIPT_OTP_ISSUED'    ? 'MyDeliveries' :
                    type === 'PAYMENT_RELEASED'      ? 'MyDeliveries' : null,
          },
        }])
        let allOk = true
        let lastErr = null
        for (const chunk of chunks) {
          const tickets = await expo.sendPushNotificationsAsync(chunk)
          for (const ticket of tickets) {
            if (ticket.status !== 'ok') {
              allOk = false
              lastErr = ticket.message || (ticket.details && ticket.details.error) || 'unknown Expo ticket error'
            }
          }
        }
        await prisma.notification.update({
          where: { id: notif.id },
          data: allOk
            ? { status: 'sent', sentAt: new Date() }
            : { status: 'failed' }
        })
        if (!allOk) {
          logger.warn('Expo push ticket reported failure', { notifId: notif.id, lastErr })
        }
      } catch (pushErr) {
        logger.error('Expo push error', { pushErr: pushErr.message })
        await prisma.notification.update({
          where: { id: notif.id },
          data: { status: 'failed' }
        }).catch(() => {})
      }
    }

    return notif
  } catch (err) {
    logger.error('createAndSend error', { err: err.message })
    throw err
  }
}
module.exports = { createAndSend }
