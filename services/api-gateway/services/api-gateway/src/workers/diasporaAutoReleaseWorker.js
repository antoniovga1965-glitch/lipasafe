'use strict'
const { Worker, Queue }          = require('bullmq')
const prisma                     = require('../utils/prisma')
const logger                     = require('../utils/logger')
const { createAndSend }          = require('../services/notificationService')
const { executeDiasporaRelease } = require('../services/diasporaReleaseService')

const connection = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 }

const diasporaReleaseQueue = new Queue('diaspora-auto-release', { connection })

const scheduleDiasporaAutoRelease = async (dealId, milestoneId, autoReleaseAt) => {
  const delay = Math.max(0, autoReleaseAt.getTime() - Date.now())
  await diasporaReleaseQueue.add(
    'auto-release',
    { dealId, milestoneId },
    { delay, jobId: `auto-release-${milestoneId}`, removeOnComplete: true, removeOnFail: false }
  )
  logger.info({ milestoneId, delay }, 'Auto-release scheduled')
}

const cancelDiasporaAutoRelease = async (milestoneId) => {
  const job = await diasporaReleaseQueue.getJob(`auto-release-${milestoneId}`)
  if (job) await job.remove()
}

const startDiasporaAutoReleaseWorker = () => {
  const worker = new Worker('diaspora-auto-release', async (job) => {
    const { dealId, milestoneId } = job.data

    const milestone = await prisma.diasporaMilestone.findUnique({ where: { id: milestoneId } })
    if (!milestone) return logger.warn({ milestoneId }, 'Auto-release: milestone not found')
    if (milestone.status !== 'WORK_SUBMITTED') {
      return logger.info({ milestoneId, status: milestone.status }, 'Auto-release skipped — already acted on')
    }

    const result = await executeDiasporaRelease({ dealId, milestoneId, releasedBy: 'AUTO_RELEASE' })

    if (!result.success) {
      logger.warn({ dealId, milestoneId, code: result.code, message: result.message }, 'Auto-release did not complete')
      return
    }

    // Notify the funder (boss) — executeDiasporaRelease already notifies the fundi
    await createAndSend({
      userId:         result.deal.funderId,
      type:           'DIASPORA_AUTO_RELEASED',
      messageEn:      `Milestone "${result.milestone.title}" auto-released after grace period. KES ${Number(result.milestone.amount).toLocaleString()} sent to ${result.deal.recipientName}.`,
      diasporaDealId: dealId,
      channel:        'push'
    }).catch(() => {})

    logger.info({ dealId, milestoneId }, 'Auto-release fired')
  }, { connection, concurrency: 5 })

  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'Auto-release worker failed'))
  return worker
}

module.exports = { scheduleDiasporaAutoRelease, cancelDiasporaAutoRelease, startDiasporaAutoReleaseWorker }
