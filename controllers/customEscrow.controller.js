"use strict";
const { z } = require("zod");
const Decimal = require("decimal.js");
const { calcFeesBuyerSide } = require("../src/utils/feeCalculator");
const prisma = require("../src/utils/prisma");
const logger = require("../src/utils/logger");
const smsQueue = require("../src/queues/smsQueue");
const customQueue = require("../src/queues/customQueue");

const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  let normalized;
  if (digits.startsWith("0")) normalized = "254" + digits.slice(1);
  else if (digits.startsWith("254")) normalized = digits;
  else throw new Error(`Invalid phone: ${phone}`);
  if (!/^254\d{9}$/.test(normalized))
    throw new Error(`Invalid phone: ${phone}`);
  return normalized;
};

const auditLog = async (db, escrowId, action, meta = {}) => {
  await db.customAuditLog.create({ data: { escrowId, action, meta } });
};

// ── 1. Create deal ─────────────────────────────────────────────────────────
const createCustomEscrow = async (req, res) => {
  try {
    const schema = z.object({
      title: z.string().min(3).max(100),
      description: z.string().min(10).max(1000),
      amount: z.coerce.number().min(1, "Minimum amount is KES 1"),
      counterpartyPhone: z.string().min(9),
      isRisky: z
        .preprocess((v) => v === "true" || v === true, z.boolean())
        .default(false),
      riskDescription: z.string().min(10).optional(),
      additionalNotes: z.string().max(500).optional(),
      completionHours: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v, 10) : null))
        .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 720), {
          message: "completionHours must be between 1 and 720 hours (max 30 days)",
        }),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, message: parsed.error.issues[0].message });
    }

    const {
      title,
      description,
      amount: rawAmount,
      counterpartyPhone: rawPhone,
      isRisky,
      riskDescription,
      additionalNotes,
      completionHours,
    } = parsed.data;

    // File validation — min 2 photos required (multer already uploaded to Cloudinary)
    const files = req.files || [];
    if (files.length < 2) {
      return res
        .status(400)
        .json({
          success: false,
          message: "At least 2 deal photos are required",
        });
    }
    const photos = files.map((f) => f.path);

    if (isRisky && !riskDescription) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Risk description required for high-risk deals",
        });
    }

    const counterpartyPhone = normalizePhone(rawPhone);
    const buyerId = req.user.userId;

    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { phone: true, fullName: true },
    });
    if (!buyer)
      return res
        .status(404)
        .json({ success: false, message: "Buyer not found" });

    if (normalizePhone(buyer.phone) === counterpartyPhone) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot create deal with yourself" });
    }

    const amount = new Decimal(rawAmount).toNearest(1, Decimal.ROUND_HALF_UP);
    const fees = calcFeesBuyerSide(amount);
    const platformFee = fees.platformFee;
    const counterpartyReceives = fees.sellerReceives;
    // fees.buyerTotal = amount charged to buyer via STK push (includes B2C)

    const deadline = completionHours
      ? new Date(Date.now() + completionHours * 60 * 60 * 1000)
      : null;

    const escrow = await prisma.$transaction(async (db) => {
      const e = await db.customEscrow.create({
        data: {
          buyerId,
          counterpartyPhone,
          title,
          description,
          amount: amount.toFixed(2),
          platformFee: platformFee.toFixed(2),
          counterpartyReceives: counterpartyReceives.toFixed(2),
          b2cCost: fees.b2cCost.toFixed(2),
          buyerTotal: fees.buyerTotal.toFixed(2),
          isRisky,
          riskDescription: riskDescription || null,
          riskPhotos: photos,
          additionalNotes: additionalNotes || null,
          completionHours: completionHours || null,
          deadline,
          status: "PENDING_ACCEPTANCE",
        },
      });
      await auditLog(db, e.id, "CREATED", {
        buyerId,
        counterpartyPhone,
        amount: amount.toFixed(2),
        isRisky,
      });
      return e;
    });

    // Auto-refund job — fires at deadline if funds still PAYMENT_HELD
    const refundDelayMs = deadline
      ? Math.max(deadline.getTime() - Date.now(), 60_000)
      : 30 * 24 * 60 * 60 * 1000;
    await customQueue.add(
      "auto_refund",
      { escrowId: escrow.id },
      {
        jobId: `custom-auto-refund-${escrow.id}`,
        delay: refundDelayMs,
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
      },
    );

    // SMS to counterparty — escrow already committed, never fail the request over this
    const riskNote = isRisky ? "  Flagged as HIGH RISK by buyer." : "";
    try {
      await smsQueue.add("send-sms", {
        to: counterpartyPhone,
        message: `LipaSafe: ${buyer.fullName || "Someone"} wants to do a custom deal with you. Title: "${title}". Amount: KES ${amount.toFixed(0)}.${riskNote} Open the app to accept or reject.`,
      });
    } catch (smsErr) {
      logger.error("createCustomEscrow: SMS queue failed", { escrowId: escrow.id, error: smsErr.message });
    }

    logger.info("Custom escrow created", {
      escrowId: escrow.id,
      buyerId,
      counterpartyPhone,
    });
    const { createAndSend: _cn1 } = require('../src/services/notificationService')
    prisma.user.findFirst({ where: { phone: counterpartyPhone }, select: { id: true } })
      .then(cp => { if (cp) _cn1({ userId: cp.id, type: 'CUSTOM_DEAL_RECEIVED', customEscrowId: escrow.id, messageEn: `${buyer.fullName || 'Someone'} wants to do a custom deal with you: "${title}". Amount: KES ${amount.toFixed(0)}. Open the app to accept or reject.` }).catch(() => {}) })
      .catch(() => {})
    return res.status(201).json({ success: true, escrowId: escrow.id, escrow });
  } catch (err) {
    logger.error("createCustomEscrow failed", { error: err.message });
    return res
      .status(500)
      .json({
        success: false,
        message: err.message.includes("Invalid phone")
          ? err.message
          : "Internal server error",
      });
  }
};

// ── 2. Accept deal ─────────────────────────────────────────────────────────
const acceptDeal = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });
    if (normalizePhone(user.phone) !== escrow.counterpartyPhone) {
      return res.status(403).json({ success: false, message: "Not your deal" });
    }

    let updatedAccept
    await prisma.$transaction(async (db) => {
      updatedAccept = await db.customEscrow.updateMany({
        where: { id: escrowId, status: "PENDING_ACCEPTANCE" },
        data: { status: "ACCEPTED" },
      });
      if (updatedAccept.count === 0) return
      await auditLog(db, escrowId, "ACCEPTED", { userId });
    });
    if (updatedAccept.count === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Deal already responded to" });
    }

    // Notify buyer
    const buyer = await prisma.user.findUnique({
      where: { id: escrow.buyerId },
      select: { phone: true },
    });
    try {
      await smsQueue.add("send-sms", {
        to: normalizePhone(buyer.phone),
        message: `LipaSafe: Counterparty accepted your custom deal "${escrow.title}". Open the app to fund the safepay deal.`,
      });
    } catch (smsErr) {
      logger.error("acceptDeal: SMS queue failed", { escrowId, error: smsErr.message });
    }

    logger.info("Custom deal accepted", { escrowId });
    const { createAndSend: _cn2 } = require('../src/services/notificationService')
    _cn2({ userId: escrow.buyerId, type: 'CUSTOM_DEAL_ACCEPTED', customEscrowId: escrowId, messageEn: `Counterparty accepted your custom deal "${escrow.title}". Open the app to fund it.` }).catch(() => {})
    return res.json({
      success: true,
      message: "Deal accepted. Buyer notified to fund the custom deal.",
    });
  } catch (err) {
    console.error(err);
    logger.error("acceptDeal failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 3. Reject deal ─────────────────────────────────────────────────────────
const rejectDeal = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });
    if (normalizePhone(user.phone) !== escrow.counterpartyPhone) {
      return res.status(403).json({ success: false, message: "Not your deal" });
    }

    const updated = await prisma.customEscrow.updateMany({
      where: { id: escrowId, status: "PENDING_ACCEPTANCE" },
      data: { status: "REJECTED" },
    });
    if (updated.count === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Deal already responded to" });
    }

    await auditLog(prisma, escrowId, "REJECTED", {
      userId,
      reason: reason || "No reason given",
    });

    const buyer = await prisma.user.findUnique({
      where: { id: escrow.buyerId },
      select: { phone: true },
    });
    try {
      await smsQueue.add("send-sms", {
        to: normalizePhone(buyer.phone),
        message: `LipaSafe: Your custom deal "${escrow.title}" was rejected by the counterparty. ${reason ? "Reason: " + reason : ""}`,
      });
    } catch (smsErr) {
      logger.error("rejectDeal: SMS queue failed", { escrowId, error: smsErr.message });
    }

    logger.info("Custom deal rejected", { escrowId });
    const { createAndSend: _cn3 } = require('../src/services/notificationService')
    _cn3({ userId: escrow.buyerId, type: 'CUSTOM_DEAL_REJECTED', customEscrowId: escrowId, messageEn: `Your custom deal "${escrow.title}" was rejected.${reason ? ' Reason: ' + reason : ''}` }).catch(() => {})
    return res.json({ success: true, message: "Deal rejected." });
  } catch (err) {
    logger.error("rejectDeal failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 4. Get escrow status ───────────────────────────────────────────────────
const getCustomEscrow = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
      include: {
        dispute: true,
        auditLogs: { orderBy: { createdAt: "desc" }, take: 20 },
        buyer: { select: { phone: true, fullName: true } },
      },
    });
    if (!escrow || escrow.deletedAt)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });

    const isBuyer = escrow.buyerId === userId;
    const isCounterparty = normalizePhone(user.phone) === escrow.counterpartyPhone;
    const isAdmin = req.user.role === "admin";

    if (!isBuyer && !isCounterparty && !isAdmin) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Buyer cannot see seller dispute response until admin rules
    let safeDispute = escrow.dispute;
    if (escrow.dispute && isBuyer && escrow.dispute.status !== "RESOLVED") {
      const { sellerResponse, sellerEvidence, ...rest } = escrow.dispute;
      safeDispute = rest;
    }

    return res.json({
      success: true,
      escrow: { ...escrow, dispute: safeDispute, photos: escrow.riskPhotos },
      role: isAdmin ? "admin" : isBuyer ? "buyer" : "counterparty",
    });
  } catch (err) {
    logger.error("getCustomEscrow failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 5. List my deals as buyer ──────────────────────────────────────────────
const getMyBuyerDeals = async (req, res) => {
  try {
    const buyerId = req.user.userId;
    const escrows = await prisma.customEscrow.findMany({
      where: { buyerId, deletedAt: null },
      include: { dispute: { select: { status: true, reason: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({
      success: true,
      escrows: escrows.map((e) => ({ ...e, photos: e.riskPhotos })),
    });
  } catch (err) {
    logger.error("getMyBuyerDeals failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 6. List my deals as counterparty ──────────────────────────────────────
const getMyCounterpartyDeals = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const escrows = await prisma.customEscrow.findMany({
      where: { counterpartyPhone: normalizePhone(user.phone), deletedAt: null },
      include: { dispute: { select: { status: true, reason: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({
      success: true,
      escrows: escrows.map((e) => ({ ...e, photos: e.riskPhotos })),
    });
  } catch (err) {
    logger.error("getMyCounterpartyDeals failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 7. Buyer confirms deal done ────────────────────────────────────────────
const buyerConfirmDeal = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const buyerId = req.user.userId;

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });
    if (escrow.buyerId !== buyerId)
      return res.status(403).json({ success: false, message: "Forbidden" });

    let updatedBuyer
    await prisma.$transaction(async (db) => {
      updatedBuyer = await db.customEscrow.updateMany({
        where: { id: escrowId, status: "PAYMENT_HELD" },
        data: { status: "BUYER_CONFIRMED", buyerConfirmedAt: new Date() },
      });
      if (updatedBuyer.count === 0) return
      await auditLog(db, escrowId, "BUYER_CONFIRMED", { buyerId });
    });
    if (updatedBuyer.count === 0) {
      const fresh = await prisma.customEscrow.findUnique({ where: { id: escrowId }, select: { status: true } });
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot confirm — status is ${fresh?.status ?? escrow.status}`,
        });
    }

    // Notify counterparty to confirm — escrow state already committed, don't fail request over SMS
    try {
      await smsQueue.add("send-sms", {
        to: escrow.counterpartyPhone,
        message: `LipaSafe: Buyer has confirmed deal "${escrow.title}" is done. Open the app to confirm receipt and release your payment of KES ${Number(escrow.counterpartyReceives).toFixed(0)}.`,
      });
    } catch (smsErr) {
      logger.error("buyerConfirmDeal: SMS queue failed", { escrowId, error: smsErr.message });
    }

    logger.info("Custom deal buyer confirmed", { escrowId });
    const { createAndSend: _cn4 } = require('../src/services/notificationService')
    prisma.user.findFirst({ where: { phone: escrow.counterpartyPhone }, select: { id: true } })
      .then(cp => { if (cp) _cn4({ userId: cp.id, type: 'CUSTOM_BUYER_CONFIRMED', customEscrowId: escrowId, messageEn: `Buyer confirmed deal "${escrow.title}" is done. Open the app to confirm receipt and release your payment.` }).catch(() => {}) })
      .catch(() => {})
    return res.json({
      success: true,
      message: "Confirmed. Counterparty notified to release payment.",
    });
  } catch (err) {
    logger.error("buyerConfirmDeal failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 8. Counterparty confirms receipt → release payment ────────────────────
const counterpartyConfirmDeal = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });
    if (normalizePhone(user.phone) !== escrow.counterpartyPhone) {
      return res.status(403).json({ success: false, message: "Not your deal" });
    }
    let updatedCounterparty
    await prisma.$transaction(async (db) => {
      updatedCounterparty = await db.customEscrow.updateMany({
        where: { id: escrowId, status: "BUYER_CONFIRMED" },
        data: {
          status: "RELEASING_FUNDS",
          counterpartyConfirmedAt: new Date(),
          payoutQueuedAt: new Date(),
        },
      });
      if (updatedCounterparty.count === 0) return
      logger.warn('DEBUG seller-confirm wrote', { escrowId, count: updatedCounterparty.count })
      await auditLog(db, escrowId, "COUNTERPARTY_CONFIRMED", { userId });
    });
    if (updatedCounterparty.count === 0) {
      const fresh = await prisma.customEscrow.findUnique({ where: { id: escrowId }, select: { status: true } });
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot confirm — status is ${fresh?.status ?? escrow.status}`,
        });
    }

    // Queue payout — idempotent jobId
    await customQueue.add(
      "payout_counterparty",
      {
        escrowId,
        counterpartyPhone: escrow.counterpartyPhone,
        amount: escrow.counterpartyReceives.toString(),
      },
      {
        jobId: `custom-payout-${escrowId}`,
        attempts: 10,
        backoff: { type: "exponential", delay: 5000 },
      },
    );

    logger.info("Custom deal counterparty confirmed — payout queued", {
      escrowId,
    });
    const { createAndSend: _cn5 } = require('../src/services/notificationService')
    _cn5({ userId: escrow.buyerId, type: 'CUSTOM_PAYMENT_RELEASED', customEscrowId: escrowId, messageEn: `Counterparty confirmed deal "${escrow.title}". Payment is being processed to their M-Pesa.` }).catch(() => {})
    return res.json({
      success: true,
      message: "Confirmed. Payment being processed.",
    });
  } catch (err) {
    process.stderr.write(
      JSON.stringify({ msg: err?.message, code: err?.code, name: err?.name }) +
        "\n",
    );
    process.stderr.write("=========================================\n");
    logger.error("counterpartyConfirmDeal failed", {
      error: err.message,
      stack: err.stack,
      full: String(err),
    });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 9. Open dispute ────────────────────────────────────────────────────────
const openDispute = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;

    const schema = z.object({
      reason: z.enum([
        "Item not delivered",
        "Service not completed",
        "Wrong item/service",
        "Fraud concern",
        "Other",
      ]),
      description: z.string().min(10).max(1000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, message: parsed.error.issues[0].message });
    }

    const { reason, description } = parsed.data;
    const evidence = (req.files || []).map((f) => f.path);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });

    const isBuyer = escrow.buyerId === userId;
    const isCounterparty =
      normalizePhone(user.phone) === escrow.counterpartyPhone;
    if (!isBuyer && !isCounterparty) {
      return res.status(403).json({ success: false, message: "Not your deal" });
    }

    const disputeable = ["PAYMENT_HELD", "BUYER_CONFIRMED"];
    if (!disputeable.includes(escrow.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot dispute — status is ${escrow.status}`,
        });
    }

    // Atomic: status lock + dispute record + audit in one transaction
    const ALREADY_DISPUTED = "ALREADY_DISPUTED";
    try {
      await prisma.$transaction(async (db) => {
        const updated = await db.customEscrow.updateMany({
          where: { id: escrowId, status: { in: disputeable } },
          data: { status: "DISPUTED" },
        });
        if (updated.count === 0) throw new Error(ALREADY_DISPUTED);

        await db.customDispute.create({
          data: {
            escrowId,
            openedBy: userId,
            openedByRole: isBuyer ? "buyer" : "counterparty",
            reason,
            description,
            evidence,
            status: "OPEN",
          },
        });

        await db.customAuditLog.create({
          data: {
            escrowId,
            action: "DISPUTE_OPENED",
            meta: { userId, reason },
          },
        });
      });
    } catch (txErr) {
      if (txErr.message === ALREADY_DISPUTED) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Already disputed or status changed",
          });
      }
      throw txErr;
    }

    // Notify admin — dispute already committed, don't fail request over SMS
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      try {
        await smsQueue.add("send-sms", {
          to: adminPhone,
          message: `LIPASAFE: Custom deal dispute opened. Escrow: ${escrowId.slice(0, 8).toUpperCase()}. Reason: ${reason}. Role: ${isBuyer ? "buyer" : "counterparty"}.`,
        });
      } catch (smsErr) {
        logger.error("openDispute: admin SMS queue failed", { escrowId, error: smsErr.message });
      }
    }

    // Schedule 48hr seller response timeout
    await customQueue
      .add(
        "dispute_seller_timeout",
        { escrowId },
        {
          jobId: `dispute-timeout-${escrowId}`,
          delay: 48 * 60 * 60 * 1000,
          attempts: 1,
        },
      )
      .catch((err) =>
        logger.warn("Dispute timeout schedule failed", { error: err.message }),
      );
    logger.info("Custom dispute opened", { escrowId, userId, reason });

    const {
      createAndSend: _notif,
    } = require("../src/services/notificationService");
    if (isBuyer) {
      prisma.user
        .findFirst({
          where: { phone: escrow.counterpartyPhone },
          select: { id: true },
        })
        .then((cp) => {
          if (cp) {
            // Registered — push + in-app
            _notif({
              userId: cp.id,
              type: "dispute_opened",
              messageEn: `Dispute opened on "${escrow.title}". The buyer raised a concern. Log in to respond with your evidence.`,
            }).catch(() => {});
          } else {
            // Not registered — fall back to SMS
            smsQueue
              .add("send-sms", {
                to: escrow.counterpartyPhone,
                message: `LipaSafe: A dispute has been opened on your deal "${escrow.title}". Log in or register at lipasafe.com to respond within 48 hours or funds may be returned to the buyer.`,
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    } else {
      _notif({
        userId: escrow.buyerId,
        type: "dispute_opened",
        messageEn: `Dispute opened on "${escrow.title}". The seller raised a concern. Funds are frozen pending review.`,
      }).catch(() => {});
    }

    return res
      .status(201)
      .json({
        success: true,
        message: "Dispute opened. Funds frozen pending resolution.",
      });
  } catch (err) {
    logger.error("openDispute failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 10. Seller responds to dispute ───────────────────────────────────────────
const sellerDisputeRespond = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;

    const schema = z.object({ response: z.string().min(10).max(1000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, message: parsed.error.issues[0].message });
    }
    const { response } = parsed.data;
    const sellerEvidence = (req.files || []).map((f) => f.path);

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
      include: { dispute: true },
    });
    if (!escrow)
      return res
        .status(404)
        .json({ success: false, message: "Escrow not found" });
    if (!escrow.dispute)
      return res
        .status(404)
        .json({ success: false, message: "No dispute found" });
    if (escrow.status !== "DISPUTED") {
      return res
        .status(400)
        .json({ success: false, message: "Escrow is not in disputed state" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    const isCounterparty =
      normalizePhone(user.phone) === escrow.counterpartyPhone;
    if (!isCounterparty) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Only the counterparty can respond to a dispute",
        });
    }
    if (escrow.dispute.openedByRole === "counterparty") {
      return res
        .status(403)
        .json({ success: false, message: "You opened this dispute — the buyer must respond" });
    }
    if (escrow.dispute.sellerResponse) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You have already submitted a response",
        });
    }

    // Cancel the 48hr timeout — seller responded in time
    try {
      const timeoutJob = await customQueue.getJob(
        `dispute-timeout-${escrowId}`,
      );
      if (timeoutJob) await timeoutJob.remove();
    } catch (_) {}

    await prisma.$transaction([
      prisma.customDispute.update({
        where: { id: escrow.dispute.id },
        data: {
          sellerResponse: response,
          sellerEvidence,
          status: "SELLER_RESPONDED",
        },
      }),
      prisma.customAuditLog.create({
        data: {
          escrowId,
          action: "DISPUTE_SELLER_RESPONDED",
          meta: { userId },
        },
      }),
    ]);

    const {
      createAndSend: _notif2,
    } = require("../src/services/notificationService");
    _notif2({
      userId: escrow.buyerId,
      type: "dispute_response",
      messageEn: `The seller responded to the dispute on "${escrow.title}". Admin is reviewing both sides.`,
    }).catch(() => {});

    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      await smsQueue.add("send-sms", {
        to: adminPhone,
        message: `LIPASAFE: Seller responded to dispute. Escrow: ${escrowId.slice(0, 8).toUpperCase()}. Both sides submitted — ready to resolve.`,
      });
    }

    logger.info("Seller dispute response submitted", { escrowId, userId });
    return res
      .status(200)
      .json({
        success: true,
        message: "Response submitted. Admin will review and resolve.",
      });
  } catch (err) {
    logger.error("sellerDisputeRespond failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// ── 11. Admin resolve dispute ──────────────────────────────────────────────
const adminResolveDispute = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const resolvedBy = req.user.userId;

    // ── Admin guard — no role, no resolution ─────────────────────────────
    if ((req.user.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const schema = z.object({
      resolution: z.enum(["RELEASE", "REFUND", "PARTIAL"]),
      buyerAmount: z.number().optional(),
      sellerAmount: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({
          success: false,
          message: parsed.error.issues[0].message,
          debug_issues: parsed.error.issues,
        });
    }

    const { resolution, buyerAmount, sellerAmount } = parsed.data;

    if (resolution === "PARTIAL" && (!buyerAmount || !sellerAmount)) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Both buyerAmount and sellerAmount required for partial split",
        });
    }

    if (resolution === "PARTIAL") {
      const escrowForValidation = await prisma.customEscrow.findUnique({
        where: { id: escrowId },
        select: { amount: true, counterpartyReceives: true },
      });
      if (escrowForValidation) {
        const total = new Decimal(buyerAmount).plus(new Decimal(sellerAmount));
        const expected = new Decimal(escrowForValidation.counterpartyReceives);
        if (!total.equals(expected)) {
          return res.status(400).json({
            success: false,
            message: `buyerAmount + sellerAmount must equal net distributable amount (KES ${expected.toFixed(2)}) — got KES ${total.toFixed(2)}. Platform fee already deducted.`,
          });
        }
      }
    }

    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
      include: { dispute: true },
    });
    if (!escrow || escrow.status !== "DISPUTED") {
      return res
        .status(400)
        .json({ success: false, message: "Escrow not in disputed state" });
    }

    const ALREADY_RESOLVED = "ALREADY_RESOLVED";
    try {
      await prisma.$transaction(async (db) => {
        // Atomic guard — prevents double resolution by two concurrent admins
        const disputeUpdate = await db.customDispute.updateMany({
          where: { escrowId, status: { not: "RESOLVED" } },
          data: {
            status: "RESOLVED",
            resolution,
            buyerAmount: buyerAmount ? buyerAmount.toFixed(2) : null,
            sellerAmount: sellerAmount ? sellerAmount.toFixed(2) : null,
            resolvedBy,
            resolvedAt: new Date(),
          },
        });

        if (disputeUpdate.count === 0) throw new Error(ALREADY_RESOLVED);

        await db.customEscrow.update({
          where: { id: escrowId },
          data: { status: "RELEASING_FUNDS" },
        });

        await db.customAuditLog.create({
          data: {
            escrowId,
            action: "DISPUTE_RESOLVED",
            meta: { resolution, buyerAmount, sellerAmount, resolvedBy },
          },
        });
      });
    } catch (txErr) {
      if (txErr.message === ALREADY_RESOLVED) {
        return res
          .status(400)
          .json({ success: false, message: "Dispute already resolved" });
      }
      throw txErr;
    }

    // Queue appropriate payout
    if (resolution === "RELEASE") {
      await customQueue.add(
        "payout_counterparty",
        {
          escrowId,
          counterpartyPhone: escrow.counterpartyPhone,
          amount: escrow.counterpartyReceives.toString(),
        },
        {
          jobId: `custom-payout-${escrowId}`,
          attempts: 10,
          backoff: { type: "exponential", delay: 5000 },
        },
      );
    } else if (resolution === "REFUND") {
      const refundAmount = new Decimal(escrow.amount).minus(
        new Decimal(escrow.platformFee),
      );
      await customQueue.add(
        "refund_buyer",
        {
          escrowId,
          buyerId: escrow.buyerId,
          amount: refundAmount.toFixed(2),
        },
        {
          jobId: `custom-refund-${escrowId}`,
          attempts: 10,
          backoff: { type: "exponential", delay: 5000 },
        },
      );
    } else {
      // Partial — queue both
      await customQueue.add(
        "payout_counterparty",
        {
          escrowId,
          counterpartyPhone: escrow.counterpartyPhone,
          amount: sellerAmount.toString(),
          isPartial: true,
        },
        {
          jobId: `custom-partial-seller-${escrowId}`,
          attempts: 10,
          backoff: { type: "exponential", delay: 5000 },
        },
      );
      await customQueue.add(
        "refund_buyer",
        {
          escrowId,
          buyerId: escrow.buyerId,
          amount: buyerAmount.toString(),
          isPartial: true,
        },
        {
          jobId: `custom-partial-buyer-${escrowId}`,
          attempts: 10,
          backoff: { type: "exponential", delay: 5000 },
        },
      );
    }

    logger.info("Custom dispute resolved", { escrowId, resolution });

    // Notify both parties
    const {
      createAndSend: _notifResolve,
    } = require("../src/services/notificationService");
    const msgBuyer =
      resolution === "REFUND"
        ? `Your dispute on "${escrow.title}" was resolved in your favour. Refund is being processed.`
        : resolution === "RELEASE"
          ? `Your dispute on "${escrow.title}" was resolved. Funds released to the seller.`
          : `Your dispute on "${escrow.title}" was resolved. Your share is being refunded.`;
    const msgSeller =
      resolution === "RELEASE"
        ? `Your dispute on "${escrow.title}" was resolved in your favour. Payment is being sent.`
        : resolution === "REFUND"
          ? `Your dispute on "${escrow.title}" was resolved. Funds returned to the buyer.`
          : `Your dispute on "${escrow.title}" was resolved. Your share is being sent.`;
    _notifResolve({
      userId: escrow.buyerId,
      type: "dispute_resolved",
      messageEn: msgBuyer,
    }).catch(() => {});
    prisma.user
      .findFirst({
        where: { phone: escrow.counterpartyPhone },
        select: { id: true },
      })
      .then((cp) => {
        if (cp)
          _notifResolve({
            userId: cp.id,
            type: "dispute_resolved",
            messageEn: msgSeller,
          }).catch(() => {});
      })
      .catch(() => {});

    return res.json({
      success: true,
      message: `Dispute resolved — ${resolution}`,
    });
  } catch (err) {
    logger.error("adminResolveDispute failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const deleteEscrow = async (req, res) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user.userId;
    const escrow = await prisma.customEscrow.findUnique({
      where: { id: escrowId },
    });
    if (!escrow)
      return res.status(404).json({ success: false, message: "Not found" });

    // allow both buyer and counterparty to soft-delete
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } })
    const isBuyer         = escrow.buyerId === userId
    const isCounterparty  = user && normalizePhone(user.phone) === escrow.counterpartyPhone
    if (!isBuyer && !isCounterparty)
      return res.status(403).json({ success: false, message: "Not your escrow" });

    const moneyHeld = ['PAYMENT_INITIATING','PAYMENT_HELD','BUYER_CONFIRMED','DISPUTED','PAYMENT_MISMATCH','RELEASING_FUNDS']
    if (moneyHeld.includes(escrow.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete — funds are actively held in this escrow' })
    }
    await prisma.customEscrow.update({
      where: { id: escrowId },
      data: { deletedAt: new Date() },
    });
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    logger.error("deleteEscrow failed", { error: err.message });
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createCustomEscrow,
  acceptDeal,
  rejectDeal,
  getCustomEscrow,
  getMyBuyerDeals,
  getMyCounterpartyDeals,
  buyerConfirmDeal,
  counterpartyConfirmDeal,
  openDispute,
  sellerDisputeRespond,
  adminResolveDispute,
  deleteEscrow,
};
