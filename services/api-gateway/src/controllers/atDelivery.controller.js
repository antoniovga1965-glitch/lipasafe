'use strict'
const prisma = require('../utils/prisma')
const logger = require('../utils/logger')

const deliveryReport = async (req, res) => {
  try {
    const { id, status } = req.body
    if (!id) return res.sendStatus(200)

    const deliveryStatus = status === 'Success' ? 'delivered' : status === 'Failed' ? 'failed' : 'pending'

    const tx = await prisma.transaction.findFirst({
      where: {
        smsDeliveryStatus: 'pending',
        state: 'delivered'
      },
      orderBy: { deliveredAt: 'desc' }
    })

    if (!tx) return res.sendStatus(200)

    await prisma.transaction.update({
      where: { id: tx.id },
      data: { smsDeliveryStatus: deliveryStatus }
    })

    logger.info('AT delivery receipt updated', { transactionId: tx.id, deliveryStatus })
    return res.sendStatus(200)
  } catch (err) {
    logger.error('AT delivery report failed', { err: err.message })
    return res.sendStatus(200)
  }
}

module.exports = { deliveryReport }
