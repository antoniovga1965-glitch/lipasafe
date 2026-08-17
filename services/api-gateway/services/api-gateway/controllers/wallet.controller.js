
"use strict";
const { createAndSend } = require('../src/services/notificationService')
const { z } = require("zod");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Decimal = require("decimal.js");
const prisma = require("../src/utils/prisma");
const logger = require("../src/utils/logger");
const smsQueue = require("../src/queues/smsQueue");
const { getTotalEscrowHeld } = require('../src/services/escrowAggregator');
const { initiateB2C }         = require('../src/utils/mpesaB2C');
const redis                   = require('../src/utils/redis');
const { calcFeesInstantSend } = require('../src/utils/feeCalculator')
const { initiateSTK }         = require('../src/utils/Mpesastk');

// ─── CONSTANTS ───────────────────────────────────
const RECALL_DAYS = 7;
const DAILY_LIMIT = new Decimal(150000);
const PER_TX_LIMIT = new Decimal(70000);
const PIN_THRESHOLD = new Decimal(500);
const FEE_RATE = new Decimal("0.02");
const VELOCITY_WINDOW = 60 * 1000;
const VELOCITY_MAX = 5;
const MAX_TX_RETRIES = 3;

// ─── HELPERS ─────────────────────────────────────
const safeError = (res, status, message) =>
  res.status(status).json({ success: false, message });
const normalizePhone = (phone) => {
  const s = phone.trim().replace(/\s/g, "");
  if (s.startsWith("+254")) return s.slice(1);
  if (s.startsWith("0")) return "254" + s.slice(1);
  return s;
};
const generateReference = () => `LS-${crypto.randomUUID()}`;
const utcDateStr = (date) => date.toISOString().slice(0, 10);

// ─── PLATFORM WALLET — cached at startup ─────────
const pw = require('../src/utils/platformWallet')
const getPlatformWalletId = pw.getPlatformWalletId;

// ─── P2034 AUTO-RETRY ─────────────────────────────
const withRetry = async (fn, retries = MAX_TX_RETRIES) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isConflict = err.code === "P2034";
      const canRetry = attempt < retries;
      if (isConflict && canRetry) {
        logger.warn("P2034 serialization conflict — retrying", { attempt });
        await new Promise((r) => setTimeout(r, attempt * 50));
        continue;
      }
      throw err;
    }
  }
};

// ─── VALIDATION ──────────────────────────────────
const sendSchema = z.object({
  recipientPhone: z
    .string()
    .regex(/^\+?(?:254|0)[17]\d{8}$/, "Invalid Kenyan phone number"),
  amount: z.coerce
    .number()
    .min(10, "Minimum send is KES 10")
    .finite()
    .multipleOf(0.01)
    .max(PER_TX_LIMIT.toNumber()),
  clientRef: z.string().uuid().optional(),
  pin: z.string().min(4).max(6).optional(),
});

// ─── GET BALANCE ─────────────────────────────────
const getBalance = async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.userId },
      select: {
        availableBalance: true,
        escrowBalance: true,
        pendingBalance: true,
        currency: true,
        dailySendTotal: true,
        dailySendDate: true,
      },
    });
    if (!wallet) return safeError(res, 404, "Wallet not found");

    const todayUTC = utcDateStr(new Date());
    const walletDayUTC = wallet.dailySendDate
      ? utcDateStr(wallet.dailySendDate)
      : null;
    const isToday = todayUTC === walletDayUTC;
    const dailyUsed = new Decimal(isToday ? wallet.dailySendTotal : 0);
    const dailyRemaining = DAILY_LIMIT.minus(dailyUsed);

    return res.status(200).json({
      success: true,
      availableBalance: new Decimal(wallet.availableBalance).toFixed(2),
      escrowBalance: await getTotalEscrowHeld(req.user.userId),
      pendingBalance: new Decimal(wallet.pendingBalance).toFixed(2),
      currency: wallet.currency,
      limits: {
        dailyLimit: DAILY_LIMIT.toFixed(2),
        dailyUsed: dailyUsed.toFixed(2),
        dailyRemaining: dailyRemaining.toFixed(2),
        perTransactionLimit: PER_TX_LIMIT.toFixed(2),
      },
    });
  } catch (err) {
    console.error("getBalance RAW:", err);
    logger.error("getBalance error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── CHECK PHONE ─────────────────────────────────
const checkPhone = async (req, res) => {
  const MIN_MS = 200;
  const start = Date.now();
  const respond = (payload) => {
    const wait = Math.max(0, MIN_MS - (Date.now() - start));
    return new Promise((r) => setTimeout(() => r(res.json(payload)), wait));
  };
  try {
    const phone = normalizePhone(req.params.phone);
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    return respond({ success: true, exists: !!user });
  } catch (err) {
    logger.error("checkPhone error", { err });
    return respond({ success: false, exists: false });
  }
};

// ─── SEND MONEY (INSTANT — fires B2C directly to recipient M-Pesa) ──────────
const sendMoney = async (req, res) => {
  let amount, recipientPhone, clientRef, pin, senderId, ipAddress;
  let platformFee, b2cCharge, totalDeduct;
  let sender, reference, platformWalletId, senderWalletId;
  try {
    // 1. Validate
    const parsed = sendSchema.safeParse({
      recipientPhone: req.body.recipientPhone,
      amount:         req.body.amount,
      clientRef:      req.body.clientRef,
      pin:            req.body.pin,
    });
    if (!parsed.success) return safeError(res, 400, 'Invalid input');

    amount         = new Decimal(parsed.data.amount);
    recipientPhone = normalizePhone(parsed.data.recipientPhone);
    clientRef      = parsed.data.clientRef || null;
    pin            = parsed.data.pin || null;
    senderId       = req.user.userId;
    ipAddress      = req.ip;

    // 2. Fee calc — sender pays all, whole KES, no decimals
    ({ platformFee, b2cCharge, totalDeduct } = calcFeesInstantSend(amount));

    // 3. Idempotency
    if (clientRef) {
      const existing = await prisma.walletTransaction.findUnique({
        where:  { clientRef },
        select: { reference: true, status: true },
      });
      if (existing) {
        return res.status(200).json({
          success:       true,
          message:       'Transaction already processed.',
          reference:     existing.reference,
          deduplicated:  true,
        });
      }
    }

    // 4. Sender checks
    sender = await prisma.user.findUnique({
      where:  { id: senderId },
      select: { phone: true, accountStatus: true, pinHash: true },
    });
    if (!sender)                          return safeError(res, 404, 'Sender not found');
    if (sender.accountStatus !== 'active') return safeError(res, 403, 'Account is not active');
    if (sender.phone === recipientPhone)   return safeError(res, 400, 'Cannot send money to yourself');

    // 5. PIN check
    if (amount.gte(PIN_THRESHOLD)) {
      if (!pin) return safeError(res, 400, `PIN required for sends of KES ${PIN_THRESHOLD.toFixed(0)} and above`);
      const validPin = await bcrypt.compare(pin, sender.pinHash);
      if (!validPin) return safeError(res, 401, 'Invalid PIN');
    }

    // 6. Reference
    reference       = generateReference();
    platformWalletId = await getPlatformWalletId();

    // 7. Atomic DB — deduct sender, credit platform, record tx as pending
    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const senderWallet = await tx.wallet.findUnique({ where: { userId: senderId } });
        if (!senderWallet) throw new Error('WALLET_NOT_FOUND');

        senderWalletId = senderWallet.id;

        // Balance check
        const balance = new Decimal(senderWallet.availableBalance);
        if (balance.lt(totalDeduct)) throw new Error('INSUFFICIENT_USE_STK');

        // Daily limit
        const todayUTC    = utcDateStr(new Date());
        const walletDayUTC = senderWallet.dailySendDate ? utcDateStr(senderWallet.dailySendDate) : null;
        const isToday     = todayUTC === walletDayUTC;
        const dailyUsed   = new Decimal(isToday ? senderWallet.dailySendTotal : 0);
        if (dailyUsed.plus(totalDeduct).gt(DAILY_LIMIT)) throw new Error('DAILY_LIMIT');

        // Velocity check
        const recentCount = await tx.walletTransaction.count({
          where: {
            fromWallet: { id: senderWallet.id },
            type:       'send',
            createdAt:  { gte: new Date(Date.now() - VELOCITY_WINDOW) },
          },
        });
        if (recentCount >= VELOCITY_MAX) throw new Error('VELOCITY_BREACH');

        // Deduct totalDeduct from sender (whole KES)
        const deducted = await tx.wallet.updateMany({
          where: {
            userId:           senderId,
            availableBalance: { gte: totalDeduct.toFixed(2) },
          },
          data: {
            availableBalance: { decrement: totalDeduct.toFixed(2) },
            totalOut:         { increment: totalDeduct.toFixed(2) },
            dailySendTotal:   isToday ? { increment: totalDeduct.toFixed(2) } : { set: totalDeduct.toFixed(2) },
            dailySendDate:    new Date(),
            lastUpdated:      new Date(),
          },
        });
        if (deducted.count === 0) throw new Error('INSUFFICIENT_USE_STK');

        // Credit platform fee
        await tx.wallet.update({
          where: { id: platformWalletId },
          data: {
            availableBalance: { increment: platformFee.toFixed(2) },
            totalIn:          { increment: platformFee.toFixed(2) },
            lastUpdated:      new Date(),
          },
        });

        // Platform fee tx record
        await tx.walletTransaction.create({
          data: {
            fromWallet: { connect: { id: senderWallet.id } },
            toWallet:   { connect: { id: platformWalletId } },
            amount:     platformFee.toFixed(2),
            type:       'platform_fee',
            status:     'completed',
            reference:  `${reference}-fee`,
            note:       `Platform fee + B2C charge for instant send ${reference}`,
          },
        });

        // Main send tx — pending until B2C fires
        await tx.walletTransaction.create({
          data: {
            fromWallet: { connect: { id: senderWallet.id } },
            toWallet:   { connect: { id: platformWalletId } },
            amount:     amount.toFixed(2),
            fee:        platformFee.toFixed(2),
            type:       'send',
            status:     'pending',
            reference,
            clientRef,
            note:       `Instant send to ${recipientPhone} via M-Pesa`,
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            actorId:    senderId,
            actorType:  'user',
            action:     'wallet_send',
            entityType: 'WalletTransaction',
            entityId:   reference,
            amount:     amount.toFixed(2),
            ipAddress,
            metadata: {
              recipientPhone,
              clientRef,
              reference,
              platformFee:  platformFee.toFixed(2),
              b2cCharge:    b2cCharge.toFixed(2),
              totalDeduct:  totalDeduct.toFixed(2),
            },
          },
        });
      }, { isolationLevel: 'Serializable', timeout: 10000 }),
    );

    // 8. Fire B2C — outside tx
    try {
      await initiateB2C({
        phone:          recipientPhone,
        amount:         amount.toNumber(), // recipient gets the full agreed amount
        originatorId:   reference,
        transactionId:  reference,
        remarks:        `LipaSafe send ${reference}`,
      });

      // Store originator key so B2C callback can route to WalletTransaction
      await redis.set(`originator:${reference}`, `wallet_send:${reference}`, 'EX', 86400);

    } catch (b2cErr) {
      logger.error('B2C failed for wallet send — reverting', { reference, err: b2cErr.message });

      // REVERT: refund sender, claw back platform fee
      try {
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { userId: senderId },
            data: {
              availableBalance: { increment: totalDeduct.toFixed(2) },
              totalOut:         { decrement: totalDeduct.toFixed(2) },
              dailySendTotal:   { decrement: totalDeduct.toFixed(2) },
              lastUpdated:      new Date(),
            },
          });
          await tx.wallet.update({
            where: { id: platformWalletId },
            data: {
              availableBalance: { decrement: platformFee.toFixed(2) },
              totalIn:          { decrement: platformFee.toFixed(2) },
              lastUpdated:      new Date(),
            },
          });
          await tx.walletTransaction.updateMany({
            where: { reference: { in: [reference, `${reference}-fee`] } },
            data:  { status: 'failed' },
          });

          // Compensating entry — append-only record of the reversal itself,
          // mirrors the recallMoney() pattern instead of leaving the failure silent.
          await tx.walletTransaction.create({
            data: {
              fromWallet: { connect: { id: platformWalletId } },
              toWallet:   { connect: { id: senderWalletId } },
              amount:     totalDeduct.toFixed(2),
              type:       'refund',
              status:     'completed',
              reference:  `${reference}-reversal`,
              note:       `B2C failed — sender refunded for ${reference}, platform fee clawed back`,
            },
          });
        });
      } catch (revertErr) {
        // CRITICAL — needs manual reconciliation
        logger.error('CRITICAL: wallet send revert failed', { reference, revertErr: revertErr.message });
      }

      return safeError(res, 502, 'M-Pesa transfer failed. Your wallet has been refunded.');
    }

    // 9. Notifications — fire and forget
    try {
      await smsQueue.add('send-notification', {
        phone:       recipientPhone,
        amount:      amount.toFixed(2),
        senderPhone: sender.phone,
        type:        'instant_send',
      });
    } catch (smsErr) {
      logger.error('SMS queue failed', { reference, smsErr: smsErr.message });
    }

    try {
      await createAndSend({
        userId:        senderId,
        type:          'money_sent',
        transactionId: null,
        messageEn:     `You sent KES ${amount.toFixed(2)} to ${recipientPhone} via M-Pesa. Ref: ${reference}`,
      });
    } catch (notifErr) {
      logger.error('Notification failed', { reference, notifErr: notifErr.message });
    }

    logger.info('sendMoney — B2C initiated', {
      senderId, recipientPhone,
      amount:      amount.toFixed(2),
      platformFee: platformFee.toFixed(2),
      b2cCharge:   b2cCharge.toFixed(2),
      totalDeduct: totalDeduct.toFixed(2),
      reference,
    });

    return res.status(200).json({
      success:     true,
      message:     "Money sent to recipient's M-Pesa.",
      reference,
      fee:         platformFee.toFixed(2),
      b2cCharge:   b2cCharge.toFixed(2),
      total:       totalDeduct.toFixed(2),
    });

  } catch (err) {
    if (err.message === 'INSUFFICIENT_USE_STK') {
      // Wallet balance insufficient — fall back to STK push
      try {
        const stkRef = crypto.randomUUID()
        const stkRes = await initiateSTK({
          phone:       req.user.phone || sender?.phone,
          amount:      totalDeduct.toNumber(),
          accountRef:  'LipaSafe Send',
          description: 'Wallet Send',
          callbackURL: process.env.MPESA_CALLBACK_URL,
        })
        // Persist pending transaction so the callback's authenticity check can find it
        try {
          await prisma.mpesaTransaction.create({
            data: {
              userId:            senderId,
              checkoutRequestId: stkRes.CheckoutRequestID,
              merchantRequestId: stkRes.MerchantRequestID,
              amount:            totalDeduct.toFixed(2),
              phone:             req.user.phone || sender?.phone,
              status:            'pending',
              idempotencyKey:    clientRef || undefined,
            },
          })
        } catch (mpesaTxErr) {
          logger.error('Failed to persist mpesaTransaction for STK fallback send', { reference: stkRef, err: mpesaTxErr.message })
          throw mpesaTxErr
        }
        // Store pending STK send in redis for callback to pick up
        await redis.set(`stk_send:${stkRes.CheckoutRequestID}`, JSON.stringify({
          recipientPhone,
          senderPhone: sender?.phone,
          amount: amount.toFixed(2),
          platformFee: platformFee.toFixed(2),
          b2cCharge: b2cCharge.toFixed(2),
          totalDeduct: totalDeduct.toFixed(2),
          senderId,
          reference: stkRef,
          clientRef,
        }), 'EX', 3600)
        return res.status(200).json({
          success: true,
          fallback: 'stk',
          message: 'Wallet balance insufficient. M-Pesa prompt sent instead.',
          checkoutRequestId: stkRes.CheckoutRequestID,
        })
      } catch (stkErr) {
        logger.error('STK fallback failed', { err: stkErr.message })
        return safeError(res, 400, 'Insufficient wallet balance and M-Pesa fallback failed.')
      }
    }
    if (err.message === 'INSUFFICIENT')         return safeError(res, 400, 'Insufficient balance');
    if (err.message === 'DAILY_LIMIT')          return safeError(res, 400, `Daily send limit of KES ${DAILY_LIMIT.toFixed(2)} reached`);
    if (err.message === 'VELOCITY_BREACH')      return safeError(res, 429, 'Too many sends. Please wait a moment.');
    if (err.message === 'WALLET_NOT_FOUND')     return safeError(res, 404, 'Wallet not found');
    if (err.code === 'P2002')                   return safeError(res, 409, 'Duplicate transaction. Please try again.');
    if (err.code === 'P2025')                   return safeError(res, 404, 'Record not found.');
    if (err.code === 'P2034')                   return safeError(res, 409, 'Transaction conflict. Please try again.');
    logger.error('sendMoney error', { err: err.message, stack: err.stack, meta: err.meta });
    return safeError(res, 500, 'Something went wrong');
  }
};

// ─── GET TRANSACTIONS ────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where = {
  OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }],
  NOT: { type: 'platform_fee' },
  deletedAt: null,
  ...(status && status !== "all" ? { status } : {}),
};
    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
        select: {
          id: true,
          amount: true,
          fee: true,
          type: true,
          status: true,
          reference: true,
          note: true,
          createdAt: true,
          fromWalletId: true,
          toWalletId: true,
          fromWallet: { select: { user: { select: { fullName: true, phone: true } } } },
          toWallet:   { select: { user: { select: { fullName: true, phone: true } } } },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    const enriched = transactions.map((tx) => {
      const direction = tx.fromWalletId === wallet.id ? "out" : "in"
      const cpUser    = direction === "out" ? tx.toWallet?.user : tx.fromWallet?.user

      // for external M-Pesa sends toWalletId is null — extract phone from note
      let counterparty = null
      if (cpUser) {
        counterparty = { fullName: cpUser.fullName || null, phone: cpUser.phone || null }
      } else if (tx.note) {
        const m = tx.note.match(/(?:to|from)\s+(254\d{9})/i)
        if (m) counterparty = { fullName: null, phone: m[1] }
      }

      return {
        ...tx,
        direction,
        amount:       new Decimal(tx.amount).toFixed(2),
        fee:          tx.fee ? new Decimal(tx.fee).toFixed(2) : "0.00",
        counterparty,
        fromWallet:   undefined,
        toWallet:     undefined,
      }
    });

    return res.status(200).json({
      success: true,
      transactions: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    logger.error("getTransactions error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── DELETE WALLET TRANSACTION (soft-delete) ─────────────────────────────────
const deleteWalletTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userWallet = await prisma.wallet.findFirst({ where: { userId } })
    const tx = await prisma.walletTransaction.findFirst({
      where: { id, deletedAt: null, OR: [{ fromWalletId: userWallet?.id }, { toWalletId: userWallet?.id }] },
    });
    console.error(tx)
    if (!tx)
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    await prisma.walletTransaction.update({ where: { id }, data: { deletedAt: new Date() } });
    return res.json({
      success: true,
      message: "Transaction removed from history",
    });
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message });
  }
};


// ─── RECALL GHOST SEND ───────────────────────────────────────────────────
// Sender recalls unclaimed ghost money after recallAt window.
// Fee is NOT refunded — only the sent amount is returned.
// Double-recall is prevented by atomic recallStartedAt lock.
const recallMoney = async (req, res) => {
  const senderId = req.user.userId
  const { reference } = req.params

  if (!reference) return safeError(res, 400, 'Transaction reference required')

  try {
    // 1. Load the original send transaction
    const sendTx = await prisma.walletTransaction.findUnique({
      where:  { reference },
      select: {
        id:          true,
        reference:   true,
        amount:      true,
        fee:         true,
        type:        true,
        status:      true,
        fromWallet:  { select: { id: true, userId: true } },
        toWallet:    { select: {
          id: true, userId: true,
          isGhost: true, claimedAt: true,
          recallAt: true, recallStartedAt: true, recallCompletedAt: true,
          availableBalance: true,
        }},
      },
    })

    if (!sendTx)                          return safeError(res, 404, 'Transaction not found')
    if (sendTx.type !== 'send')           return safeError(res, 400, 'Not a send transaction')
    if (sendTx.status !== 'completed')    return safeError(res, 400, 'Transaction is not in a recallable state')

    // 2. Verify caller is the original sender
    if (!sendTx.fromWallet || sendTx.fromWallet.userId !== senderId)
      return safeError(res, 403, 'You are not the sender of this transaction')

    const ghost = sendTx.toWallet
    if (!ghost)                           return safeError(res, 400, 'Recipient wallet not found')
    if (!ghost.isGhost)                   return safeError(res, 400, 'Recipient is a registered user — cannot recall')
    if (ghost.claimedAt !== null)         return safeError(res, 400, 'Recipient has already claimed this money')

    // 3. Time gate — recallAt must have passed
    if (!ghost.recallAt || new Date() < new Date(ghost.recallAt))
      return safeError(res, 400, `Money can only be recalled after ${new Date(ghost.recallAt).toISOString()}`)

    // 4. Already recalled check
    if (ghost.recallCompletedAt !== null)
      return res.status(200).json({ success: true, message: 'Already recalled.', deduplicated: true })

    // 5. Atomic lock — prevent double recall race condition
    const locked = await prisma.wallet.updateMany({
      where: {
        id:                 ghost.id,
        isGhost:            true,
        claimedAt:          null,
        recallStartedAt:    null,   
        recallCompletedAt:  null,
      },
      data: { recallStartedAt: new Date() },
    })
    if (locked.count === 0)
      return safeError(res, 409, 'Recall already in progress or completed')

    // 6. Amount to return — fee is NOT refunded (service was rendered)
    const recallAmount = new Decimal(sendTx.amount)
    const recallRef    = `recall_${reference}`

    // 7. Atomic DB update
    await prisma.$transaction(async (tx) => {
      // Deduct from ghost wallet
      const deducted = await tx.wallet.updateMany({
        where: {
          id:               ghost.id,
          availableBalance: { gte: recallAmount.toFixed(2) },
        },
        data: {
          availableBalance:   { decrement: recallAmount.toFixed(2) },
          totalOut:           { increment: recallAmount.toFixed(2) },
          recallCompletedAt:  new Date(),
          lastUpdated:        new Date(),
        },
      })
      if (deducted.count === 0) throw new Error('GHOST_BALANCE_INSUFFICIENT')

      // Credit sender — amount only, no fee
      await tx.wallet.update({
        where: { userId: senderId },
        data: {
          availableBalance: { increment: recallAmount.toFixed(2) },
          totalIn:          { increment: recallAmount.toFixed(2) },
          lastUpdated:      new Date(),
        },
      })
          
      // Mark original send tx as recalled
      await tx.walletTransaction.update({
        where:  { reference },
        data:   { status: 'recalled' },
      })

      // Record recall transaction
      await tx.walletTransaction.create({
        data: {
          fromWallet: { connect: { id: ghost.id } },
          toWallet:   { connect: { id: sendTx.fromWallet.id } },
          amount:     recallAmount.toFixed(2),
          type:       'recall',
          status:     'completed',
          reference:  recallRef,
          note:       `Recall of unclaimed ghost send ${reference}`,
        },
      })

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId:    senderId,
          actorType:  'user',
          action:     'wallet_recall',
          entityType: 'WalletTransaction',
          entityId:   recallRef,
          amount:     recallAmount.toFixed(2),
          metadata:   { originalReference: reference, recallRef, fee: sendTx.fee?.toString() || '0' },
        },
      })
    }, { isolationLevel: 'Serializable', timeout: 10000 })

    logger.info('recallMoney success', { senderId, reference, recallAmount: recallAmount.toFixed(2) })

    return res.status(200).json({
      success:       true,
      message:       'Money recalled successfully. Note: platform fee is non-refundable.',
      recallAmount:  recallAmount.toFixed(2),
      feeRetained:   sendTx.fee ? new Decimal(sendTx.fee).toFixed(2) : '0.00',
      reference:     recallRef,
    })

  } catch (err) {
    if (err.message === 'GHOST_BALANCE_INSUFFICIENT')
      return safeError(res, 500, 'Ghost wallet balance mismatch — contact support')
    logger.error('recallMoney error', { senderId, reference, error: err.message })
    return safeError(res, 500, 'Recall failed. Please try again.')
  }
}

module.exports = {
  getBalance,
  checkPhone,
  sendMoney, recallMoney,
  getTransactions,
  deleteWalletTransaction,
  getPlatformWalletId,
};
