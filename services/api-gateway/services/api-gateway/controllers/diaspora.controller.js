"use strict";
const { z } = require("zod");
const prisma = require("../src/utils/prisma");
const logger = require("../src/utils/logger");
const { sendSMSSafe } = require("../src/services/smsService");
const { createAndSend } = require("../src/services/notificationService");
const { calcFeesDiaspora } = require('../src/utils/feeCalculator')
const { initiateB2C } = require('../src/utils/mpesaB2C')
const { FLOAT_ID } = require('../src/utils/diasporaConstants')
const { executeDiasporaRelease } = require('../src/services/diasporaReleaseService')
const { scheduleDiasporaAutoRelease, cancelDiasporaAutoRelease } = require('../src/workers/diasporaAutoReleaseWorker')
const { emitToUser } = require('../src/utils/socket')

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  let normalized;
  if (digits.startsWith("0")) normalized = "254" + digits.slice(1);
  else if (digits.startsWith("254")) normalized = digits;
  else throw new Error(`Invalid phone: ${phone}`);
  if (!/^254\d{9}$/.test(normalized)) throw new Error(`Invalid phone: ${phone}`);
  return normalized;
};

const generateReference = () => {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `LSF-DSP-${ymd}-${rand}`;
};

// ── 1. Create deal ─────────────────────────────────────────────────────────
const createDeal = async (req, res) => {
  try {
    const schema = z.object({
      recipientName: z.string().min(2),
      recipientPhone: z.string().min(9),
      dealType: z.enum(["CONSTRUCTION", "FUNDI", "GOODS", "CUSTOM"]),
      totalAmount: z.coerce.number().min(100),
      funderCurrency: z.string().min(2).max(5).default('KES'),
      funderAmount: z.coerce.number().min(1).default(0),
      funderCountry: z.string().min(2).default('KE'),
      description: z.string().min(3),
      siteLocation: z.string().optional(),
      deadlineUtc: z.string().datetime().optional(),
      customCategory: z.string().optional(),
      milestones: z.array(z.object({
        title: z.string().min(2),
        description: z.string().optional(),
        amount: z.coerce.number().min(1),
        order: z.number().int(),
        evidenceType: z.enum(["PHOTO", "VIDEO", "DOCUMENT_RECEIPT", "WRITTEN_CONFIRMATION"]).optional(),
      })).min(1),
    });

    if (req.file?.path) req.body.proofUrl = req.file.path;
      if (typeof req.body.milestones === 'string') {
        try { req.body.milestones = JSON.parse(req.body.milestones); } catch (e) {}
      }
      const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message });

    const { recipientName, recipientPhone, dealType, totalAmount, funderCurrency,
            funderAmount, funderCountry, description, siteLocation, deadlineUtc, customCategory, milestones } = parsed.data;

    const milestonesTotal = milestones.reduce((s, m) => s + m.amount, 0);
    if (Math.abs(milestonesTotal - totalAmount) > 1)
      return res.status(400).json({ success: false, message: "Milestones amounts must add up to total amount" });

    const deal = await prisma.diasporaDeal.create({
      data: {
        reference: generateReference(),
        funderId: req.user.id,
        recipientName,
        recipientPhone: normalizePhone(recipientPhone),
        dealType,
        totalAmount,
        amountInEscrow: totalAmount,
        funderCurrency,
        funderAmount,
        funderCountry,
        description,
        siteLocation,
        deadlineUtc: deadlineUtc ? new Date(deadlineUtc) : null,
        customCategory,
        referencePhotoUrls: (req.files || []).map(f => f.path),
        status: "PENDING_PAYMENT",
        milestones: {
          create: milestones.map((m) => ({
            title: m.title,
            description: m.description,
            amount: m.amount,
            order: m.order,
            evidenceType: m.evidenceType,
            status: "PENDING",
          })),
        },
      },
      include: { milestones: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId:    req.user.id,
        actorType:  "user",
        action:     "DEAL_CREATED",
        entityType: "DIASPORA_DEAL",
        entityId:   deal.id,
        amount:     deal.totalAmount,
        newState:   { status: deal.status, dealType: deal.dealType, reference: deal.reference },
      },
    }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: DEAL_CREATED"));

    logger.info({ dealId: deal.id, userId: req.user.id }, "Diaspora deal created");
    return res.status(201).json({ success: true, deal });
  } catch (err) {
    logger.error(err, "createDeal error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 2. Submit proof of payment ─────────────────────────────────────────────
// proofUrl can come from multipart upload (req.file) or JSON body
const submitProof = async (req, res) => {
  try {
    const schema = z.object({
      proofUrl: z.string().url().optional(),
      amountKes: z.coerce.number().min(1).optional(),
      currency: z.string().min(2).max(5).optional(),
      foreignAmount: z.coerce.number().min(1).optional(),
    });

    if (req.file?.path) req.body.proofUrl = req.file.path;
      const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message });

    const deal = await prisma.diasporaDeal.findFirst({
      where: { OR: [{ id: req.params.id }, { bankReference: req.params.id }], funderId: req.user.userId },
    });

    if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
    if (deal.status !== "PENDING_PAYMENT")
      return res.status(400).json({ success: false, message: "Deal is not awaiting payment" });

    const [deposit] = await prisma.$transaction([
      prisma.diasporaDeposit.create({
        data: {
          dealId: deal.id,
          proofUrl: parsed.data.proofUrl,
          amountKes: parsed.data.amountKes ?? deal.totalAmount,
          currency: parsed.data.currency ?? deal.funderCurrency,
          foreignAmount: parsed.data.foreignAmount ?? deal.funderAmount,
          status: "PENDING",
        },
      }),
      prisma.diasporaDeal.update({
        where: { id: deal.id },
        data: { status: "PENDING_CONFIRMATION" },
      }),
    ]);

    // Notify secretary via notification
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        diasporaDealId: deal.id,
        type: "DIASPORA_PAYMENT_SUBMITTED",
        channel: "push",
        messageEn: `Payment proof submitted for deal ${deal.reference}. Please verify.`,
        status: "pending",
      },
    });

    logger.info({ dealId: deal.id }, "Proof submitted");
    return res.status(200).json({ success: true, deposit });
  } catch (err) {
    logger.error(err, "submitProof error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 3. Secretary confirms deposit ──────────────────────────────────────────
const confirmDeposit = async (req, res) => {
  try {
    const schema = z.object({
      bankRef: z.string().min(3),
    });

    if (req.file?.path) req.body.proofUrl = req.file.path;
      const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message });

    const deal = await prisma.diasporaDeal.findUnique({
      where: { id: req.params.id },
      include: { deposit: true },
    });

    if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
    if (deal.status !== "PENDING_CONFIRMATION")
      return res.status(400).json({ success: false, message: "Deal is not pending confirmation" });

    await prisma.$transaction([
      prisma.diasporaDeposit.update({
        where: { dealId: deal.id },
        data: {
          bankRef: parsed.data.bankRef,
          confirmedBy: req.user.id,
          confirmedAt: new Date(),
          status: "CONFIRMED",
        },
      }),
      prisma.diasporaDeal.update({
        where: { id: deal.id },
        data: {
          status: "HELD",
          bankReference: parsed.data.bankRef,
        },
      }),
    ]);

    // SMS recipient in Kenya
    await sendSMSSafe(deal.recipientPhone, `LipaSafe: KES ${deal.totalAmount.toLocaleString()} is held in escrow for you. Job: ${deal.description.slice(0, 60)}. Start work now. Ref: ${deal.reference}`);

    // Push recipient if they have the app (deal has no recipientId — lookup by phone)
    const recipientUser = await prisma.user.findFirst({
      where:  { phone: deal.recipientPhone },
      select: { id: true }
    })
    if (recipientUser) {
      await createAndSend({
        userId:    recipientUser.id,
        type:      'DIASPORA_DEPOSIT_CONFIRMED',
        messageEn: `KES ${deal.totalAmount.toLocaleString()} is now held in escrow for you. Job: ${deal.description.slice(0, 60)}. Ref: ${deal.reference}`,
        diasporaDealId: deal.id,
        channel:   'push'
      }).catch(err => logger.warn({ err: err.message }, 'Recipient diaspora push failed'))
    }

    // Notify funder
    await prisma.notification.create({
      data: {
        userId: deal.funderId,
        diasporaDealId: deal.id,
        type: "DIASPORA_DEPOSIT_CONFIRMED",
        channel: "push",
        messageEn: `Your payment for ${deal.reference} has been confirmed. Funds are now held in escrow.`,
        status: "pending",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId:    req.user.id,
        actorType:  "admin",
        action:     "DEPOSIT_CONFIRMED",
        entityType: "DIASPORA_DEAL",
        entityId:   deal.id,
        amount:     deal.totalAmount,
        newState:   { status: "HELD", bankRef: parsed.data.bankRef },
      },
    }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: DEPOSIT_CONFIRMED"));

    logger.info({ dealId: deal.id, secretaryId: req.user.id }, "Deposit confirmed");
    return res.status(200).json({ success: true, message: "Deposit confirmed. Deal is now HELD." });
  } catch (err) {
    logger.error(err, "confirmDeposit error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 4. Secretary rejects deposit ───────────────────────────────────────────
const rejectDeposit = async (req, res) => {
  try {
    const schema = z.object({ reason: z.string().min(5) });
    if (req.file?.path) req.body.proofUrl = req.file.path;
      const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message });

    const deal = await prisma.diasporaDeal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
    if (deal.status !== "PENDING_CONFIRMATION")
      return res.status(400).json({ success: false, message: "Deal is not pending confirmation" });

    await prisma.$transaction([
      prisma.diasporaDeposit.update({
        where: { dealId: deal.id },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: parsed.data.reason },
      }),
      prisma.diasporaDeal.update({
        where: { id: deal.id },
        data: { status: "PENDING_PAYMENT" },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: deal.funderId,
        diasporaDealId: deal.id,
        type: "DIASPORA_DEPOSIT_REJECTED",
        channel: "push",
        messageEn: `Your payment proof for ${deal.reference} was rejected. Reason: ${parsed.data.reason}. Please resubmit.`,
        status: "pending",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId:    req.user.id,
        actorType:  "admin",
        action:     "DEPOSIT_REJECTED",
        entityType: "DIASPORA_DEAL",
        entityId:   deal.id,
        newState:   { status: "PENDING_PAYMENT", reason: parsed.data.reason },
      },
    }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: DEPOSIT_REJECTED"));

    return res.status(200).json({ success: true, message: "Deposit rejected." });
  } catch (err) {
    logger.error(err, "rejectDeposit error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 5. Funder releases a milestone ─────────────────────────────────────────
const releaseMilestone = async (req, res) => {
  try {
    const deal = await prisma.diasporaDeal.findFirst({
      where: { OR: [{ id: req.params.id }, { bankReference: req.params.id }], funderId: req.user.userId },
      include: { milestones: true },
    });

    if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
    if (deal.status !== "HELD" && deal.status !== "ACTIVE")
      return res.status(400).json({ success: false, message: "Deal is not active" });

    const milestone = deal.milestones.find((m) => m.id === req.params.milestoneId);
    if (!milestone) return res.status(404).json({ success: false, message: "Milestone not found" });

    const result = await executeDiasporaRelease({ dealId: deal.id, milestoneId: milestone.id, releasedBy: req.user.id });
    if (!result.success) {
      const status = result.code === "NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ success: false, message: result.message });
    }
    return res.status(200).json({ success: true, message: "Milestone released. Payment on the way." });
  } catch (err) {
    logger.error(err, "releaseMilestone error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 6. Get my deals (funder) ───────────────────────────────────────────────
const getMyDeals = async (req, res) => {
  try {
    const deals = await prisma.diasporaDeal.findMany({
      where: { funderId: req.user.id },
      include: { milestones: { orderBy: { order: "asc" } }, deposit: true },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ success: true, deals });
  } catch (err) {
    logger.error(err, "getMyDeals error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 7. Get single deal ─────────────────────────────────────────────────────
const getDeal = async (req, res) => {
  try {
    const deal = await prisma.diasporaDeal.findFirst({
      where: {
        OR: [
          { id: req.params.id,          funderId: req.user.userId },
          { bankReference: req.params.id, funderId: req.user.userId },
        ],
      },
      include: { milestones: { orderBy: { order: "asc" } }, deposit: true },
    });
    if (!deal) return res.status(404).json({ success: false, message: "Deal not found" });
    return res.status(200).json({ success: true, deal });
  } catch (err) {
    logger.error(err, "getDeal error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── 8. Admin — get all pending deals ──────────────────────────────────────
const adminGetPendingDeals = async (req, res) => {
  try {
    const deals = await prisma.diasporaDeal.findMany({
      where: { status: { in: ["PENDING_CONFIRMATION", "HELD", "ACTIVE"] } },
      include: {
        milestones: true,
        deposit: true,
        funder: { select: { fullName: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const shaped = deals.map((d) => ({
      ...d,
      funderName: d.funder?.fullName || "Unknown",
      counterpartyName: d.recipientName,
      counterpartyPhone: d.recipientPhone,
    }));

    return res.status(200).json({ success: true, deals: shaped });
  } catch (err) {
    logger.error(err, "adminGetPendingDeals error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


const adminGetDisputes = async (req, res) => {
  try {
    const { status, dealId, page = 1, limit = 20 } = req.query
    const where = {}
    if (status) where.status = status
    if (dealId) where.dealId = dealId
    where.deletedAt = null

    const [disputes, total] = await Promise.all([
      prisma.diasporaDispute.findMany({
        where,
        skip:    (Number(page) - 1) * Number(limit),
        take:    Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          deal: {
            select: {
              reference:      true,
              totalAmount:    true,
              amountInEscrow: true,
              status:         true,
              funder:         { select: { fullName: true, phone: true } }
            }
          },
          milestone: { select: { title: true, amount: true, status: true } }
        }
      }),
      prisma.diasporaDispute.count({ where })
    ])

    return res.status(200).json({
      success: true,
      data:    { disputes, total, page: Number(page), limit: Number(limit) }
    })
  } catch (err) {
    logger.error(err, 'adminGetDisputes error')
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


const dismissDispute = async (req, res) => {
  try {
    const { disputeId } = req.params
    await prisma.diasporaDispute.update({
      where: { id: disputeId },
      data: { deletedAt: new Date() },
    })
    res.json({ success: true, message: 'Dispute dismissed' })
  } catch (err) {
    logger.error(err, 'dismissDispute error')
    res.status(500).json({ success: false, message: 'Failed to dismiss dispute' })
  }
}

const resolveDispute = async (req, res) => {
  try {
    const schema = z.object({
      outcome:        z.enum(['REFUND_FUNDER', 'RELEASE_TO_WORKER']),
      resolution:     z.string().min(5),
      secretaryNotes: z.string().optional()
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })

    const { outcome, resolution, secretaryNotes } = parsed.data

    const dispute = await prisma.diasporaDispute.findUnique({
      where:   { id: req.params.disputeId },
      include: { deal: true, milestone: true }
    })
    if (!dispute)
      return res.status(404).json({ success: false, message: 'Dispute not found' })
    if (dispute.status !== 'OPEN')
      return res.status(400).json({ success: false, message: 'Dispute is already resolved' })

    const { deal, milestone } = dispute

    const disputeUpdate = {
      status:         'RESOLVED',
      resolution,
      secretaryNotes: secretaryNotes ?? null,
      resolvedBy:     req.user.id,
      resolvedAt:     new Date()
    }

    if (outcome === 'REFUND_FUNDER') {
      await prisma.diasporaDispute.update({ where: { id: dispute.id }, data: disputeUpdate })

      await prisma.auditLog.create({
        data: {
          actorId:    req.user.id,
          actorType:  "admin",
          action:     "DISPUTE_RESOLVED_REFUND",
          entityType: "DIASPORA_DISPUTE",
          entityId:   dispute.id,
          newState:   { outcome, resolution, dealId: deal.id },
        },
      }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: DISPUTE_RESOLVED_REFUND"));

      await createAndSend({
        userId:         deal.funderId,
        type:           'DIASPORA_DEPOSIT_REJECTED',
        messageEn:      `Dispute for deal ${deal.reference} resolved in your favour. Funds are frozen — our team will contact you.`,
        diasporaDealId: deal.id,
        channel:        'push'
      }).catch(() => {})

      if (milestone) {
        const worker = await prisma.user.findFirst({
          where:  { phone: normalizePhone(deal.recipientPhone) },
          select: { id: true }
        }).catch(() => null)
        if (worker) {
          await createAndSend({
            userId:         worker.id,
            type:           'DIASPORA_DEPOSIT_REJECTED',
            messageEn:      `Dispute for deal ${deal.reference} was resolved. Milestone "${milestone.title}" will not be released.`,
            diasporaDealId: deal.id,
            channel:        'push'
          }).catch(() => {})
        }
      }

      return res.status(200).json({ success: true, message: 'Dispute resolved — funder notified, funds remain frozen.' })
    }

    if (outcome === 'RELEASE_TO_WORKER') {
      if (!milestone)
        return res.status(400).json({ success: false, message: 'No milestone attached to this dispute' })

      const releaseResult = await executeDiasporaRelease({
        dealId:      deal.id,
        milestoneId: milestone.id,
        releasedBy:  req.user.id
      })
      if (!releaseResult.success)
        return res.status(400).json({ success: false, message: releaseResult.message })

      await prisma.diasporaDispute.update({ where: { id: dispute.id }, data: disputeUpdate })

      await prisma.auditLog.create({
        data: {
          actorId:    req.user.id,
          actorType:  "admin",
          action:     "DISPUTE_RESOLVED_RELEASE",
          entityType: "DIASPORA_DISPUTE",
          entityId:   dispute.id,
          newState:   { outcome, resolution, dealId: deal.id, milestoneId: milestone.id },
        },
      }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: DISPUTE_RESOLVED_RELEASE"));

      await createAndSend({
        userId:         deal.funderId,
        type:           'DIASPORA_MILESTONE_RELEASED',
        messageEn:      `Dispute for deal ${deal.reference} resolved. Milestone "${milestone.title}" has been released to the worker.`,
        diasporaDealId: deal.id,
        channel:        'push'
      }).catch(() => {})

      return res.status(200).json({ success: true, message: 'Dispute resolved — milestone released to worker.' })
    }
  } catch (err) {
    logger.error(err, 'resolveDispute error')
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}




const getFundiDeals = async (req, res) => {
  try {
    const phone = normalizePhone(req.user.phone)
    const { status, page = 1, limit = 20 } = req.query
    const where = { recipientPhone: phone }
    if (status) where.status = status

    const [deals, total] = await Promise.all([
      prisma.diasporaDeal.findMany({
        where,
        skip:    (Number(page) - 1) * Number(limit),
        take:    Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          milestones: { orderBy: { order: 'asc' } },
          funder:     { select: { fullName: true, phone: true, avatarUrl: true } }
        }
      }),
      prisma.diasporaDeal.count({ where })
    ])

    return res.status(200).json({ success: true, data: { deals, total, page: Number(page), limit: Number(limit) } })
  } catch (err) {
    logger.error(err, 'getFundiDeals error')
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const submitWorkProof = async (req, res) => {
  try {
    const deal = await prisma.diasporaDeal.findUnique({
      where:   { id: req.params.id },
      include: { milestones: true }
    })
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' })
    if (normalizePhone(deal.recipientPhone) !== normalizePhone(req.user.phone))
      return res.status(403).json({ success: false, message: 'Not your deal' })
    if (!['ACTIVE', 'HELD'].includes(deal.status))
      return res.status(400).json({ success: false, message: 'Deal is not active' })

    const milestone = deal.milestones.find(m => m.id === req.params.milestoneId)
    if (!milestone) return res.status(404).json({ success: false, message: 'Milestone not found' })
    if (!['PENDING', 'IN_PROGRESS'].includes(milestone.status))
      return res.status(400).json({ success: false, message: 'Milestone cannot accept work proof at this stage' })

    const proofUrls = (req.files || []).map(f => f.path)
    if (!proofUrls.length)
      return res.status(400).json({ success: false, message: 'At least one proof file required' })

    const autoReleaseAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

    await prisma.diasporaMilestone.update({
      where: { id: milestone.id },
      data:  { workProofUrls: proofUrls, workSubmittedAt: new Date(), autoReleaseAt, status: 'WORK_SUBMITTED' }
    })

    await scheduleDiasporaAutoRelease(deal.id, milestone.id, autoReleaseAt)

    await createAndSend({
      userId:         deal.funderId,
      type:           'DIASPORA_MILESTONE_RELEASED',
      messageEn:      `Fundi has submitted work proof for milestone "${milestone.title}" on deal ${deal.reference}. Review and release or dispute within 72 hours.`,
      diasporaDealId: deal.id,
      channel:        'push'
    }).catch(() => {})

    return res.status(200).json({ success: true, message: 'Work proof submitted. Funder has 72 hours to review.' })
  } catch (err) {
    logger.error(err, 'submitWorkProof error')
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}

const disputeMilestone = async (req, res) => {
  try {
    const schema = z.object({ reason: z.string().min(5) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })

    const deal = await prisma.diasporaDeal.findUnique({
      where:   { id: req.params.id },
      include: { milestones: true }
    })
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' })
    if (deal.funderId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Only the funder can raise a dispute' })
    if (!['ACTIVE', 'HELD'].includes(deal.status))
      return res.status(400).json({ success: false, message: 'Deal is not active' })

    const milestone = deal.milestones.find(m => m.id === req.params.milestoneId)
    if (!milestone) return res.status(404).json({ success: false, message: 'Milestone not found' })
    if (milestone.status !== 'WORK_SUBMITTED')
      return res.status(400).json({ success: false, message: 'Can only dispute after fundi submits work' })

    const evidenceUrls = (req.files || []).map(f => f.path)

    await prisma.$transaction([
      prisma.diasporaMilestone.update({ where: { id: milestone.id }, data: { status: 'DISPUTED' } }),
      prisma.diasporaDeal.update({ where: { id: deal.id }, data: { status: 'DISPUTED' } }),
      prisma.diasporaDispute.create({
        data: { dealId: deal.id, milestoneId: milestone.id, raisedBy: req.user.id, reason: parsed.data.reason, evidenceUrls, status: 'OPEN' }
      })
    ])

    await cancelDiasporaAutoRelease(milestone.id)

    await createAndSend({
      userId:         deal.funderId,
      type:           'DIASPORA_DEPOSIT_REJECTED',
      messageEn:      `Your dispute for milestone "${milestone.title}" on deal ${deal.reference} has been raised. LipaSafe will review.`,
      diasporaDealId: deal.id,
      channel:        'push'
    }).catch(() => {})

    return res.status(200).json({ success: true, message: 'Dispute raised. LipaSafe will review.' })
  } catch (err) {
    logger.error(err, 'disputeMilestone error')
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}


// ─── REQUEST REFUND BANK DETAILS (Secretary → Funder) ─────────────────────
const requestRefundBankDetails = async (req, res) => {
  try {
    const dispute = await prisma.diasporaDispute.findUnique({
      where:   { id: req.params.disputeId },
      include: { deal: true }
    })
    if (!dispute)
      return res.status(404).json({ success: false, message: 'Dispute not found' })
    if (dispute.status !== 'OPEN')
      return res.status(400).json({ success: false, message: 'Dispute already resolved' })
    if (dispute.bankDetailsRequested)
      return res.status(400).json({ success: false, message: 'Bank details already requested' })

    await prisma.diasporaDispute.update({
      where: { id: dispute.id },
      data:  { bankDetailsRequested: true }
    })

    // Push to funder in real time
    emitToUser(dispute.deal.funderId, 'refund_bank_details_requested', {
      disputeId: dispute.id,
      dealId:    dispute.dealId,
      message:   'LipaSafe needs your bank details to process your refund'
    })

    await prisma.auditLog.create({
      data: {
        actorId:    req.user.id,
        actorType:  "admin",
        action:     "BANK_DETAILS_REQUESTED",
        entityType: "DIASPORA_DISPUTE",
        entityId:   dispute.id,
        newState:   { dealId: dispute.dealId },
      },
    }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: BANK_DETAILS_REQUESTED"));

    await createAndSend({
      userId:         dispute.deal.funderId,
      type:           'DIASPORA_BANK_DETAILS_REQUESTED',
      messageEn:      `LipaSafe needs your bank details to process your refund for deal ${dispute.deal.reference}.`,
      diasporaDealId: dispute.dealId,
      channel:        'push'
    }).catch(() => {})
    logger.info('Bank details requested from funder', { disputeId: dispute.id, funderId: dispute.deal.funderId })
    return res.status(200).json({ success: true, message: 'Request sent to funder' })
  } catch (err) {
    logger.error('requestRefundBankDetails error', { err })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

// ─── SUBMIT REFUND BANK DETAILS (Funder → Secretary) ──────────────────────
const submitRefundBankDetails = async (req, res) => {
  try {
    const schema = z.object({
      bankName:  z.string().min(2),
      accountNo: z.string().min(5)
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success)
      return res.status(400).json({ success: false, message: parsed.error.issues[0].message })

    const dispute = await prisma.diasporaDispute.findUnique({
      where:   { id: req.params.disputeId },
      include: { deal: true }
    })
    if (!dispute)
      return res.status(404).json({ success: false, message: 'Dispute not found' })
    if (dispute.deal.funderId !== req.user.userId)
      return res.status(403).json({ success: false, message: 'Forbidden' })
    if (!dispute.bankDetailsRequested)
      return res.status(400).json({ success: false, message: 'No refund request pending' })

    await prisma.diasporaDispute.update({
      where: { id: dispute.id },
      data:  { refundBankName: parsed.data.bankName, refundAccountNo: parsed.data.accountNo }
    })

    await prisma.auditLog.create({
      data: {
        actorId:    req.user.id,
        actorType:  "user",
        action:     "BANK_DETAILS_SUBMITTED",
        entityType: "DIASPORA_DISPUTE",
        entityId:   dispute.id,
        newState:   { bankName: parsed.data.bankName, accountNo: parsed.data.accountNo },
      },
    }).catch(err => logger.warn({ err: err.message }, "auditLog write failed: BANK_DETAILS_SUBMITTED"));

    // Notify ALL staff sockets
    const staffUsers = await prisma.user.findMany({ where: { role: 'staff' } })
    for (const staff of staffUsers) {
      emitToUser(staff.id, 'bank_details_received', {
        disputeId: dispute.id,
        dealId:    dispute.dealId,
        bankName:  parsed.data.bankName,
        accountNo: parsed.data.accountNo,
        message:   `Funder submitted bank details for deal ${dispute.dealId.slice(0,8)}`
      })
    }

    logger.info('Funder submitted bank details', { disputeId: dispute.id })
    return res.status(200).json({ success: true, message: 'Bank details submitted' })
  } catch (err) {
    logger.error('submitRefundBankDetails error', { err })
    return res.status(500).json({ success: false, message: 'Something went wrong' })
  }
}

// ─── Paginated activity feed for the secretary dashboard ──────────────────
// Pulls only diaspora-related audit entries (deal + dispute actions), newest first.
const getActivityLogs = async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page, 10)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const where = { entityType: { in: ["DIASPORA_DEAL", "DIASPORA_DISPUTE"] } };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { fullName: true, phone: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error(err, "getActivityLogs error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─── Full deal list for dashboard aggregation (e.g. Deal Breakdown by Type) ─
// Distinct from adminGetPendingDeals, which only returns PENDING_PAYMENT deals.
const adminGetAllDeals = async (req, res) => {
  try {
    const deals = await prisma.diasporaDeal.findMany({
      select: {
        id: true,
        reference: true,
        dealType: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ success: true, deals });
  } catch (err) {
    logger.error(err, "adminGetAllDeals error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createDeal, submitProof, confirmDeposit, rejectDeposit,
  releaseMilestone,
  getMyDeals, getDeal, adminGetPendingDeals,
  adminGetDisputes, resolveDispute, dismissDispute,
  getFundiDeals, submitWorkProof, disputeMilestone,
  requestRefundBankDetails, submitRefundBankDetails,
  getActivityLogs, adminGetAllDeals
}
