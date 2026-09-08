'use strict'
const prisma = require('./prisma')
const logger = require('./logger')

const scheduleTimer = async (timerQueue, transactionId, jobType, delayMs) => {
  try {
    await timerQueue.add(jobType, { transactionId, jobType }, {
      delay: delayMs,
      jobId: `${jobType}_${transactionId}`.replace(/:/g, '-')
    })
    await prisma.timerJob.create({
      data: { transactionId, jobType, scheduledAt: new Date(Date.now() + delayMs), status: 'pending' }
    })
  } catch (err) {
    if (err.code === 'P2002') {
      logger.warn('scheduleTimer: duplicate — skipping', { transactionId, jobType })
      return
    }
    throw err
  }
}

const cancelTimer = async (timerQueue, transactionId, jobType) => {
  try {
    const job = await timerQueue.getJob(`${jobType}_${transactionId}`)
    if (job) await job.remove()
    await prisma.timerJob.updateMany({
      where: { transactionId, jobType, status: 'pending' },
      data:  { status: 'cancelled' }
    })
  } catch (err) {
    logger.warn('Failed to cancel timer', { transactionId, jobType, err: err.message })
  }
}

module.exports = { scheduleTimer, cancelTimer }
