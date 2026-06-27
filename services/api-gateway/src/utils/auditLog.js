'use strict'
const prisma = require('./prisma')


const logAudit = async ({
  actorId,
  actorType = 'admin',
  action,
  entityType,
  entityId,
  previousState = null,
  newState = null,
  amount = null,
  ipAddress = null,
  metadata = null,
  transactionId = null,
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorType,
        action,
        entityType,
        entityId,
        previousState,
        newState,
        amount,
        ipAddress,
        metadata,
        transactionId,
      },
    })
  } catch (err) {
    console.error('auditLog write failed', { err: err.message, action, entityId })
  }
}

module.exports = { logAudit }
