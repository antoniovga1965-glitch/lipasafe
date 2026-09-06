'use strict'

// Derives FundiEscrow.status from the current FundiPayout rows for a job and
// writes it. Single source of truth for "what actually happened to the
// money" so callback success/failure and the reconciler don't each maintain
// their own ad-hoc status string — and so PARTIAL dispute decisions (one leg
// done, the other still pending/failed) resolve to an honest combined state
// instead of one leg's write stomping the other's.
async function syncFundiEscrowStatus(prisma, jobId) {
  const payouts = await prisma.fundiPayout.findMany({ where: { fundiJobId: jobId } })
  if (payouts.length === 0) return

  const byType = {}
  for (const p of payouts) byType[p.payoutType] = p.status // pending | sent | completed | failed

  const release = byType.payout
  const refund  = byType.refund
  const legs    = [release, refund].filter(Boolean)

  let status
  if (legs.length === 1) {
    const type  = release ? 'release' : 'refund'
    const label = type === 'release' ? 'released' : 'refunded'
    if (legs[0] === 'completed')      status = label
    else if (legs[0] === 'failed')    status = `${type}_failed`
    else                              status = `${type}_pending`
  } else {
    const allCompleted = legs.every(s => s === 'completed')
    const anyFailed     = legs.some(s => s === 'failed')
    const anyPending     = legs.some(s => s === 'pending' || s === 'sent')
    if (allCompleted)              status = 'resolved'
    else if (anyFailed && anyPending) status = 'resolution_partial_failed'
    else if (anyFailed)            status = 'resolution_failed'
    else                            status = 'resolution_pending'
  }

  const data = { status }
  if (status === 'released') data.releasedAt = new Date()
  if (status === 'refunded') data.refundedAt = new Date()
  if (status === 'resolved') {
    // PARTIAL decision, both legs completed — record whichever legs were
    // actually non-zero amounts (a leg only exists in `byType` if its
    // FundiPayout row was created, i.e. its amount was > 0).
    if (release) data.releasedAt = new Date()
    if (refund)  data.refundedAt = new Date()
  }
  // resolution_failed/resolution_partial_failed intentionally leave existing
  // releasedAt/refundedAt alone — a partial decision may have one leg done
  // (timestamp already correct) and one leg failed (no timestamp is correct).

  await prisma.fundiEscrow.updateMany({ where: { jobId }, data })
}

module.exports = { syncFundiEscrowStatus }
