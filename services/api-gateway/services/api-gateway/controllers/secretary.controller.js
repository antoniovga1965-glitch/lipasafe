'use strict'
const prisma = require('../src/utils/prisma')

async function getSetting(key, fallback = '') {
  const row = await prisma.platformSetting.findUnique({ where: { key } })
  return row ? row.value : fallback
}

async function setSetting(key, value, updatedBy) {
  await prisma.platformSetting.upsert({
    where: { key },
    update: { value: String(value), updatedBy },
    create: { key, value: String(value), updatedBy },
  })
}

exports.getSettings = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { fullName: true, email: true, phone: true },
    })

    const [gbp, usd, eur, aed, inr, cut,
           lowFloat, newConfirmation, disputeRaised, b2cSuccess] = await Promise.all([
      getSetting('gbp_rate', '168.00'),
      getSetting('usd_rate', '129.00'),
      getSetting('eur_rate', '140.00'),
      getSetting('aed_rate', '35.00'),
      getSetting('inr_rate', '1.55'),
      getSetting('platform_cut', '2.5'),
      getSetting('notif_low_float', 'true'),
      getSetting('notif_new_confirmation', 'true'),
      getSetting('notif_dispute_raised', 'true'),
      getSetting('notif_b2c_success', 'false'),
    ])

    res.json({
      success: true,
      data: {
        profile: { name: user?.fullName ?? '', email: user?.email ?? '', phone: user?.phone ?? '' },
        rates: { gbp, usd, eur, aed, inr },
        cut,
        notifications: {
          lowFloat:        lowFloat        === 'true',
          newConfirmation: newConfirmation === 'true',
          disputeRaised:   disputeRaised   === 'true',
          b2cSuccess:      b2cSuccess      === 'true',
        },
        bank: {
          name:          await getSetting('bank_name',           'Equity Bank Kenya'),
          accountName:   await getSetting('bank_account_name',   'LipaSafe Limited'),
          accountNumber: await getSetting('bank_account_number', '0123456789012'),
          swift:         await getSetting('bank_swift',          'EQBLKENA'),
          branch:        await getSetting('bank_branch',         'Upper Hill, Nairobi'),
          currency:      await getSetting('bank_currency',       'KES / USD / GBP'),
        },
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to load settings' })
  }
}

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body
    await prisma.user.update({
      where: { id: req.user.id },
      data: { ...(name && { fullName: name }), ...(phone && { phone }) },
    })
    res.json({ success: true, message: 'Profile updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update profile' })
  }
}

exports.updateRates = async (req, res) => {
  try {
    const { gbp, usd, eur, aed, inr } = req.body
    await Promise.all([
      gbp != null && setSetting('gbp_rate', gbp, req.user.id),
      usd != null && setSetting('usd_rate', usd, req.user.id),
      eur != null && setSetting('eur_rate', eur, req.user.id),
      aed != null && setSetting('aed_rate', aed, req.user.id),
      inr != null && setSetting('inr_rate', inr, req.user.id),
    ])
    res.json({ success: true, message: 'Rates updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update rates' })
  }
}

exports.updateCut = async (req, res) => {
  try {
    const { cut } = req.body
    if (cut == null || isNaN(Number(cut))) {
      return res.status(400).json({ success: false, message: 'Invalid cut value' })
    }
    await setSetting('platform_cut', cut, req.user.id)
    res.json({ success: true, message: 'Platform cut updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update cut' })
  }
}

exports.updateNotifications = async (req, res) => {
  try {
    const { lowFloat, newConfirmation, disputeRaised, b2cSuccess } = req.body
    await Promise.all([
      lowFloat        != null && setSetting('notif_low_float',         lowFloat,        req.user.id),
      newConfirmation != null && setSetting('notif_new_confirmation',   newConfirmation, req.user.id),
      disputeRaised   != null && setSetting('notif_dispute_raised',     disputeRaised,   req.user.id),
      b2cSuccess      != null && setSetting('notif_b2c_success',        b2cSuccess,      req.user.id),
    ])
    res.json({ success: true, message: 'Notification preferences updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update notifications' })
  }
}

// ── GET /secretary/bank-details (public — used by mobile) ─────────────────────
exports.getBankDetails = async (req, res) => {
  try {
    const [bankName, accountName, accountNumber, swift, branch, currency] = await Promise.all([
      getSetting('bank_name',           'Equity Bank Kenya'),
      getSetting('bank_account_name',   'LipaSafe Limited'),
      getSetting('bank_account_number', '0123456789012'),
      getSetting('bank_swift',          'EQBLKENA'),
      getSetting('bank_branch',         'Upper Hill, Nairobi'),
      getSetting('bank_currency',       'KES / USD / GBP'),
    ])
    res.json({ success: true, data: { bankName, accountName, accountNumber, swift, branch, currency } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch bank details' })
  }
}

// ── PATCH /secretary/bank-details ─────────────────────────────────────────────
exports.updateBankDetails = async (req, res) => {
  try {
    const { bankName, accountName, accountNumber, swift, branch, currency } = req.body
    await Promise.all([
      bankName      != null && setSetting('bank_name',           bankName,      req.user.id),
      accountName   != null && setSetting('bank_account_name',   accountName,   req.user.id),
      accountNumber != null && setSetting('bank_account_number', accountNumber, req.user.id),
      swift         != null && setSetting('bank_swift',          swift,         req.user.id),
      branch        != null && setSetting('bank_branch',         branch,        req.user.id),
      currency      != null && setSetting('bank_currency',       currency,      req.user.id),
    ])
    res.json({ success: true, message: 'Bank details updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update bank details' })
  }
}

// ── GET /secretary/logs ───────────────────────────────────────────────────────
exports.getLogs = async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '200'), 500)
    const offset = parseInt(req.query.offset || '0')

    const [floatTxs, deposits, deals, disputes, milestones] = await Promise.all([
      // Float top-ups and releases
      prisma.diasporaFloatTx.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, type: true, amount: true, reference: true,
          dealRef: true, addedBy: true, note: true, createdAt: true,
        },
      }),

      // Payment proofs confirmed / rejected
      prisma.diasporaDeposit.findMany({
        where: { status: { in: ['CONFIRMED', 'REJECTED'] } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true, status: true, amountKes: true, currency: true,
          foreignAmount: true, bankRef: true, confirmedBy: true,
          confirmedAt: true, rejectedAt: true, rejectionReason: true,
          deal: { select: { reference: true, recipientName: true } },
        },
      }),

      // Deals created
      prisma.diasporaDeal.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, reference: true, status: true, totalAmount: true,
          funderCurrency: true, funderAmount: true, recipientName: true,
          recipientPhone: true, createdAt: true,
          funder: { select: { fullName: true, phone: true } },
        },
      }),

      // Disputes raised and resolved
      prisma.diasporaDispute.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, status: true, reason: true, resolution: true,
          resolvedAt: true, resolvedBy: true, raisedBy: true,
          createdAt: true,
          deal: { select: { reference: true, recipientName: true } },
        },
      }),

      // Milestones released
      prisma.diasporaMilestone.findMany({
        where: { status: 'RELEASED' },
        orderBy: { releasedAt: 'desc' },
        take: limit,
        select: {
          id: true, title: true, amount: true, releasedAt: true,
          releasedBy: true, status: true,
          deal: { select: { reference: true, recipientName: true } },
        },
      }),
    ])

    // ── normalise into unified log entries ──────────────────────────────────
    const entries = []

    floatTxs.forEach((tx) => {
      entries.push({
        id:          `float-${tx.id}`,
        timestamp:   tx.createdAt,
        action:      tx.type === 'CREDIT' ? 'Float Added' : 'Float Released',
        performedBy: tx.addedBy || 'System',
        dealRef:     tx.dealRef || tx.reference,
        amount:      parseFloat(tx.amount),
        details:     tx.note || `Ref: ${tx.reference}`,
        category:    'Float',
      })
    })

    deposits.forEach((d) => {
      const isConfirmed = d.status === 'CONFIRMED'
      entries.push({
        id:          `deposit-${d.id}`,
        timestamp:   isConfirmed ? d.confirmedAt : d.rejectedAt,
        action:      isConfirmed ? 'Payment Confirmed' : 'Payment Rejected',
        performedBy: d.confirmedBy || 'Secretary',
        dealRef:     d.deal?.reference || d.bankRef || '—',
        amount:      d.amountKes,
        details:     isConfirmed
                       ? `${d.foreignAmount} ${d.currency} | Bank ref: ${d.bankRef || '—'}`
                       : `Rejected: ${d.rejectionReason || '—'}`,
        category:    'Payment',
      })
    })

    deals.forEach((deal) => {
      entries.push({
        id:          `deal-${deal.id}`,
        timestamp:   deal.createdAt,
        action:      'Deal Created',
        performedBy: deal.funder?.fullName || deal.funder?.phone || '—',
        dealRef:     deal.reference,
        amount:      parseFloat(deal.totalAmount),
        details:     `${deal.recipientName} (${deal.recipientPhone}) | ${deal.funderAmount} ${deal.funderCurrency}`,
        category:    'Deal',
      })
    })

    disputes.forEach((d) => {
      const isResolved = d.status !== 'OPEN'
      entries.push({
        id:          `dispute-${d.id}`,
        timestamp:   isResolved ? (d.resolvedAt || d.createdAt) : d.createdAt,
        action:      isResolved ? 'Dispute Resolved' : 'Dispute Raised',
        performedBy: isResolved ? (d.resolvedBy || 'Secretary') : d.raisedBy,
        dealRef:     d.deal?.reference || '—',
        amount:      null,
        details:     isResolved
                       ? `Resolution: ${d.resolution || '—'}`
                       : `Reason: ${d.reason}`,
        category:    'Dispute',
      })
    })

    milestones.forEach((m) => {
      entries.push({
        id:          `milestone-${m.id}`,
        timestamp:   m.releasedAt,
        action:      'Milestone Released',
        performedBy: m.releasedBy || 'System',
        dealRef:     m.deal?.reference || '—',
        amount:      m.amount,
        details:     `${m.title} — to ${m.deal?.recipientName || '—'}`,
        category:    'Milestone',
      })
    })

    // sort all by timestamp desc, remove null timestamps, paginate
    const sorted = entries
      .filter((e) => e.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(offset, offset + limit)

    res.json({ success: true, data: sorted, total: sorted.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch logs' })
  }
}

exports.getConfig = async (req, res) => {
  try {
    const [gbp, usd, eur, aed, inr, cut] = await Promise.all([
      getSetting('gbp_rate', '168.00'),
      getSetting('usd_rate', '129.00'),
      getSetting('eur_rate', '140.00'),
      getSetting('aed_rate', '35.00'),
      getSetting('inr_rate', '1.55'),
      getSetting('platform_cut', '2'),
    ]);
    res.json({
      success: true,
      rates: {
        USD: parseFloat(usd),
        GBP: parseFloat(gbp),
        EUR: parseFloat(eur),
        AED: parseFloat(aed),
        INR: parseFloat(inr),
      },
      platformCut: parseFloat(cut),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch config' });
  }
};
