"use strict";

const axios = require("axios");
const crypto = require("crypto");
const Decimal = require("decimal.js");
const { z } = require("zod");
const prisma = require("../src/utils/prisma");
const logger = require("../src/utils/logger");
const redis = require("../src/utils/redis");
const b2cRetryQueue = require("../src/queues/b2cRetryQueue")
const { getPlatformWalletId } = require("../src/utils/platformWallet")

// ─── CONFIGURATION ───────────────────────────
const isSandbox = process.env.MPESA_ENV === "sandbox";
const baseURL = isSandbox
  ? "https://sandbox.safaricom.co.ke"
  : "https://api.safaricom.co.ke";

const MAX_DEPOSIT = new Decimal(150_000);
const MIN_DEPOSIT = new Decimal(1);
const DAILY_DEPOSIT = new Decimal(300_000);

// M-Pesa API credentials
const MPESA_SHORTCODE = process.env.MPESA_STK_SHORTCODE;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const CALLBACK_SECRET = process.env.MPESA_CALLBACK_SECRET;

// Rate limiting config
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 5;
const STK_PUSH_DEDUP_WINDOW = 30;

// ─── CUSTOM ERROR CLASSES ────────────────────
class MpesaError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = "MpesaError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

class ValidationError extends MpesaError {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message, code, 400);
    this.name = "ValidationError";
  }
}

class RateLimitError extends MpesaError {
  constructor(message = "Rate limit exceeded. Please try again later.") {
    super(message, "RATE_LIMITED", 429);
    this.name = "RateLimitError";
  }
}

class IdempotencyError extends MpesaError {
  constructor(message = "Duplicate request detected.") {
    super(message, "DUPLICATE_REQUEST", 409);
    this.name = "IdempotencyError";
  }
}

// ─── VALIDATION SCHEMAS ──────────────────────
const StkPushSchema = z.object({
  amount: z
    .union([z.string().min(1), z.number().positive()])
    .transform((val) => {
      const num = typeof val === "string" ? parseFloat(val) : val;
      if (isNaN(num)) throw new Error("Invalid amount");
      return num;
    })
    .refine((val) => val >= 1, "Minimum deposit is KES 1")
    .refine((val) => val <= 150_000, "Maximum deposit is KES 150,000"),
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^(?:254|0|\\+254)?[17]\\d{8}$/, "Invalid Kenyan phone number")
    .optional(),
  idempotencyKey: z.string().uuid().optional(),
});

const CallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
  "x-mpesa-signature": z.string().optional(),
  "x-mpesa-timestamp": z.string().optional(),
});

// ─── CIRCUIT BREAKER ─────────────────────────
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.state = "CLOSED";
    this.failures = 0;
    this.nextAttempt = 0;
  }

  async execute(fn) {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttempt) {
        throw new MpesaError(
          "M-Pesa API temporarily unavailable",
          "CIRCUIT_OPEN",
          503,
        );
      }
      this.state = "HALF_OPEN";
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      console.error(error)
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
  }

  onFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.timeout;
      logger.warn("Circuit breaker opened for M-Pesa API", {
        failures: this.failures,
        retryAfter: new Date(this.nextAttempt).toISOString(),
      });
    }
  }
}

const mpesaCircuitBreaker = new CircuitBreaker(5, 60000);

// ─── RETRY HELPER ────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable =
        error.response?.status >= 500 ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT";
      if (!isRetryable || attempt === maxRetries) throw error;

      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      logger.warn(
        `Retry attempt ${attempt}/${maxRetries} for M-Pesa API call`,
        {
          delay: Math.round(delay),
          error: error.message,
        },
      );
      await sleep(delay);
    }
  }
  throw lastError;
};

// ─── TOKEN CACHE ─────────────────────────────
const { getToken } = require('../src/utils/mpesaToken');

// ─── PHONE UTILITIES ─────────────────────────
const PHONE_REGEX = /^(?:254|0|\+254)?[17]\d{8}$/;

const normalizePhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    throw new ValidationError("Phone number is required");
  }

  let normalized = phone.trim().replace(/[\s\-\(\)]/g, "");

  if (normalized.startsWith("+")) normalized = normalized.slice(1);
  if (normalized.startsWith("0")) normalized = "254" + normalized.slice(1);

  if (!PHONE_REGEX.test(normalized)) {
    throw new ValidationError(`Invalid phone number format: ${phone}`);
  }

  return normalized;
};

// ─── AMOUNT UTILITIES ────────────────────────
const toKsh = (value) => {
  try {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    throw new ValidationError("Invalid amount format");
  }
};

// Convert Prisma Decimal to Decimal.js safely
const fromPrismaDecimal = (value) => {
  if (!value) return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(value.toString());
};

// ─── SECURITY: CALLBACK VERIFICATION ─────────
const verifyCallbackSignature = (body, signature, timestamp) => {
  if (!CALLBACK_SECRET) {
    logger.warn(
      "MPESA_CALLBACK_SECRET not set — skipping signature verification",
    );
    return true;
  }

  if (!signature || !timestamp) {
    throw new MpesaError(
      "Missing callback signature headers",
      "INVALID_SIGNATURE",
      401,
    );
  }

  // Prevent replay attacks — reject callbacks older than 5 minutes
  const now = Date.now();
  const callbackTime = parseInt(timestamp, 10);
  if (isNaN(callbackTime) || Math.abs(now - callbackTime) > 5 * 60 * 1000) {
    throw new MpesaError(
      "Callback timestamp too old or invalid",
      "REPLAY_DETECTED",
      401,
    );
  }

  const payload = typeof body === "string" ? body : JSON.stringify(body);  const expected = crypto
    .createHmac("sha256", CALLBACK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");

  if (sigBuf.length !== expBuf.length) {
    throw new MpesaError(
      "Invalid callback signature",
      "INVALID_SIGNATURE",
      401,
    );
  }

  const isValid = crypto.timingSafeEqual(sigBuf, expBuf);

  if (!isValid) {
    throw new MpesaError(
      "Invalid callback signature",
      "INVALID_SIGNATURE",
      401,
    );
  }

  return true;
};

// ─── IDEMPOTENCY HELPERS ─────────────────────
const generateIdempotencyKey = () => crypto.randomUUID();

const checkIdempotency = async (key, userId) => {
  const cacheKey = `mpesa:idempotency:result:${userId}:${key}`;
  const exists = await redis.get(cacheKey);
  if (exists) return JSON.parse(exists);
  return null;
};

const acquireIdempotencyLock = async (key, userId, ttl = 300) => {
  const lockKey = `mpesa:idempotency:lock:${userId}:${key}`;
  const acquired = await redis.set(lockKey, "locked", "NX", "EX", ttl);
  return acquired === "OK";
};

const cacheIdempotency = async (key, userId, result, ttl = 300) => {
  const cacheKey = `mpesa:idempotency:result:${userId}:${key}`;
  await redis.setex(cacheKey, ttl, JSON.stringify(result));
};

// ─── RATE LIMITING ───────────────────────────
const checkRateLimit = async (userId) => {
  const key = `mpesa:ratelimit:${userId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }
  if (current > RATE_LIMIT_MAX) {
    const ttl = await redis.ttl(key);
    throw new RateLimitError(`Too many requests. Retry after ${ttl} seconds.`);
  }
};

// ─── DUPLICATE STK PUSH PREVENTION ───────────
const checkRecentStkPush = async (userId, amount) => {
  const key = `mpesa:recent_push:${userId}`;
  const existing = await redis.get(key);
  if (existing) {
    const { amount: lastAmount, time } = JSON.parse(existing);
    const age = (Date.now() - time) / 1000;
    if (
      age < STK_PUSH_DEDUP_WINDOW &&
      new Decimal(lastAmount).equals(new Decimal(amount))
    ) {
      throw new IdempotencyError(
        `A similar request was made ${Math.round(age)}s ago. Please wait.`,
      );
    }
  }
  await redis.setex(
    key,
    STK_PUSH_DEDUP_WINDOW,
    JSON.stringify({ amount: amount.toString(), time: Date.now() }),
  );
};

// ─── WALLET HELPERS ──────────────────────────
const getOrCreateWallet = async (db, userId) => {
  let wallet = await db.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    logger.info("Auto-creating wallet for user", { userId });
    wallet = await db.wallet.create({
      data: {
        userId,
        availableBalance: 0,
        totalIn: 0,
        totalOut: 0,
        lastUpdated: new Date(),
      },
    });
  }
  return wallet;
};

// ─── REQUEST CONTEXT ─────────────────────────
const getRequestContext = (req) => ({
  requestId: req.id || crypto.randomUUID(),
  userId: req.user?.userId,
  ip: req.ip || req.connection?.remoteAddress,
});

// ─── STK PUSH ────────────────────────────────
const stkPush = async (req, res) => {
  const ctx = getRequestContext(req);
  const log = (msg, meta = {}) => logger.info(msg, { ...ctx, ...meta });
  const logError = (msg, meta = {}) => logger.error(msg, { ...ctx, ...meta });

  try {
    // ── 1. Validate input ──────────────────────
    const parseResult = StkPushSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );
      throw new ValidationError(issues.join(", "));
    }

    const { amount, phone: overridePhone, idempotencyKey } = parseResult.data;
    const userId = req.user.userId;
    ctx.userId = userId;

    // ── 2. Rate limiting ───────────────────────
    try {
      await checkRateLimit(userId);
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      logger.error("Rate limit check failed — Redis down, allowing request", {
        userId,
        err: err.message,
      });
    }

    // ── 3. Idempotency check ───────────────────
    const effectiveKey = idempotencyKey || generateIdempotencyKey();
    const cachedResult = await checkIdempotency(effectiveKey, userId);
    if (cachedResult) {
      log("Returning cached idempotent response");
      return res.status(200).json(cachedResult);
    }

    // Acquire lock — prevent race between concurrent identical requests
    const lockAcquired = await acquireIdempotencyLock(effectiveKey, userId);
    if (!lockAcquired) {
      return res
        .status(409)
        .json({
          success: false,
          code: "DUPLICATE_REQUEST",
          message: "Duplicate request in flight. Please wait.",
        });
    }

    // Release lock on failure so user can retry — success overwrites with cached result
    const idempotencyLockKey = `mpesa:idempotency:lock:${userId}:${effectiveKey}`
    let requestSucceeded = false
    try {

    // ── 4. Fetch user ──────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, accountStatus: true },
    });
    if (!user) throw new MpesaError("User not found", "USER_NOT_FOUND", 404);
    if (user.accountStatus !== "active")
      throw new MpesaError("Account is deactivated", "ACCOUNT_INACTIVE", 403);

    const targetPhone = overridePhone || user.phone;
    const mpesaPhone = normalizePhone(targetPhone);

    // ── 5. Amount validation ───────────────────
    const parsedAmount = toKsh(amount);
    const roundedAmount = parsedAmount
      .toNearest(1, Decimal.ROUND_HALF_UP)
      .toNumber();
    const feeAmount = parsedAmount
      .times(0.02)
      .toNearest(1, Decimal.ROUND_HALF_UP);
    const totalAmount = parsedAmount
      .plus(feeAmount)
      .toNearest(1, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (parsedAmount.lt(MIN_DEPOSIT)) {
      throw new ValidationError("Minimum deposit is KES 1");
    }
    if (parsedAmount.gt(MAX_DEPOSIT)) {
      throw new ValidationError(
        `Maximum deposit of KES ${MAX_DEPOSIT} exceeded`,
      );
    }

    // ── 6. Daily limit check ───────────────────
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const today = await prisma.mpesaTransaction.aggregate({
      where: {
        userId,
        status: "completed",
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });

    const dailyTotal = fromPrismaDecimal(today._sum.amount);
    if (dailyTotal.plus(parsedAmount).gt(DAILY_DEPOSIT)) {
      throw new ValidationError(
        `Daily deposit limit of KES ${DAILY_DEPOSIT} reached. Used: KES ${dailyTotal}`,
      );
    }

    // ── 7. Duplicate push prevention ───────────
    await checkRecentStkPush(userId, parsedAmount);

    // ── 8. Prepare M-Pesa payload ──────────────
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`,
    ).toString("base64");

    const token = await getToken();

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: totalAmount,
      PartyA: mpesaPhone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: mpesaPhone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: "LipaSafe",
      TransactionDesc: "Wallet Top Up",
    };

    // ── 9. Call M-Pesa API ─────────────────────
    const response = await mpesaCircuitBreaker.execute(() =>
      withRetry(() =>
        axios.post(`${baseURL}/mpesa/stkpush/v1/processrequest`, payload, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000,
        }),
      ),
    );

    const data = response.data;

    if (data.ResponseCode !== "0") {
      logError("M-Pesa returned error", {
        responseCode: data.ResponseCode,
        description: data.ResponseDescription,
      });
      throw new MpesaError(
        data.ResponseDescription || "Payment initiation failed",
        "MPESA_ERROR",
        400,
      );
    }

    // ── 10. Persist transaction ────────────────
    let createdTx;
    try {
      createdTx = await prisma.mpesaTransaction.create({
        data: {
          userId,
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          amount: parsedAmount.toFixed(2),
          fee: feeAmount.toFixed(2),
          phone: mpesaPhone,
          status: "pending",
          idempotencyKey: effectiveKey,
        },
      });
      logger.info("mpesaTransaction.create SUCCESS", { id: createdTx.id, checkoutRequestId: data.CheckoutRequestID });
    } catch (createErr) {
      logger.error("mpesaTransaction.create FAILED", { error: createErr.message, code: createErr.code, stack: createErr.stack });
      throw createErr;
    }

    const result = {
      success: true,
      message: "STK push sent successfully",
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
    };

    // Cache idempotent response
    await cacheIdempotency(effectiveKey, userId, result);

    log("STK Push initiated", {
      amount: roundedAmount,
      checkoutRequestId: data.CheckoutRequestID,
    });

    requestSucceeded = true
    return res.json(result);
    } finally {
      if (!requestSucceeded) {
        await redis.del(idempotencyLockKey).catch(() => {})
      }
    }
  } catch (error) {
    
    logError("STK Push failed", {
      error: error.message,
      stack: error.stack,
      safaricomDetails: error.response?.data,
    });

    if (error instanceof MpesaError && error.isOperational) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : error.message,
    });
  }
};

// ─── SHARED: PROCESS SUCCESSFUL PAYMENT ──────
const processSuccessfulPayment = async (tx, amount, mpesaRef, ctx) => {
  // check before entering transaction — if mpesaRef already on another tx, don't try to set it
  const refAlreadyUsed = mpesaRef && tx.mpesaRef !== mpesaRef
    ? !!(await prisma.mpesaTransaction.findFirst({ where: { mpesaRef, NOT: { id: tx.id } } }))
    : false;
  await prisma.$transaction(async (db) => {
    const wallet = await getOrCreateWallet(db, tx.userId);
    const balanceBefore = fromPrismaDecimal(wallet.availableBalance);
    const depositAmount = parseFloat(tx.amount);

    await db.wallet.update({
      where: { userId: tx.userId },
      data: {
        availableBalance: { increment: depositAmount },
        totalIn: { increment: depositAmount },
        lastUpdated: new Date(),
      },
    });

    try {
      await db.mpesaTransaction.update({
        where: { id: tx.id },
        data: {
          status: "completed",
          ...(!tx.mpesaRef && !refAlreadyUsed ? { mpesaRef } : {}),
          resultDesc: "Success",
          processedAt: new Date(),
        },
      });
    } catch (updateErr) {
      if (updateErr.code === 'P2002') {
        // mpesaRef already on another tx — update status only
        await db.mpesaTransaction.update({
          where: { id: tx.id },
          data: { status: "completed", resultDesc: "Success", processedAt: new Date() },
        });
      } else { throw updateErr; }
    }

    await db.auditLog.create({
      data: {
        actorId: tx.userId,
        actorType: "user",
        action: "mpesa_deposit",
        entityType: "MpesaTransaction",
        entityId: tx.id,
        amount: amount.toFixed(2),
        previousState: { balance: balanceBefore.toFixed(2) },
        newState: { mpesaRef, checkoutRequestId: tx.checkoutRequestId },
      },
    });
  });
  logger.info("Wallet credited via processSuccessfulPayment", {
    userId: tx.userId,
    amount: amount.toFixed(2),
    mpesaRef,
  });
};

// ─── CALLBACK HANDLER ────────────────────────
const callback = async (req, res) => {
  const ctx = getRequestContext(req);
  ctx.requestId = req.id || crypto.randomUUID();

  // ── 1. Always accept callback immediately ──
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  // -- 2. Parse and validate payload ----
  let cb;
  try {
    const parsed = CallbackSchema.parse(req.body);
    cb = parsed.Body.stkCallback;
  } catch (error) {
    logger.error("Callback validation failed", {
      ...ctx,
      error: error.message,
    });
    return;
  }
  const { CheckoutRequestID: checkoutReqId, ResultCode: resultCode } = cb;
  // -- 3. Verify authenticity ----
  // Safaricom does not sign Daraja callbacks with any header - checking
  // for one always failed and silently dropped every production callback.
  // Real authenticity: confirm this CheckoutRequestID matches a
  // transaction our own system initiated and is expecting a result for.
  try {
    const pendingTx = await prisma.mpesaTransaction.findFirst({
      where: { checkoutRequestId: checkoutReqId },
      select: { id: true },
    });
    if (!pendingTx) {
      logger.error("Callback rejected - no matching pending transaction", {
        ...ctx,
        checkoutReqId,
      });
      return;
    }
  } catch (error) {
    logger.error("Callback authenticity check failed", {
      ...ctx,
      error: error.message,
    });
    return;
  }
  ctx.checkoutRequestId = checkoutReqId;

  logger.info("M-Pesa callback received", { ...ctx, resultCode });

  try {
    // ── 4. Check if already processed (dedup) ──
    const processedKey = `mpesa:callback:${checkoutReqId}`;
    let alreadyProcessed = null;
    let sendCtx = null;
    try {
      alreadyProcessed = await redis.get(processedKey);
    } catch (redisErr) {
      logger.error("Redis down — skipping dedup, continuing callback", { ...ctx, error: redisErr.message });
    }
    if (alreadyProcessed) {
      logger.info("Callback already processed, skipping", ctx);
      return;
    }

    // ── 5. Handle failure ──────────────────────
    if (resultCode !== 0) {
      await prisma.mpesaTransaction.updateMany({
        where: { checkoutRequestId: checkoutReqId, status: "pending" },
        data: {
          status: "failed",
          resultDesc: cb.ResultDesc,
        },
      });
      await redis.setex(processedKey, 86400, "failed").catch(e => logger.error("Redis setex failed", { error: e.message }));
      logger.info("Payment marked as failed", {
        ...ctx,
        resultDesc: cb.ResultDesc,
      });
      return;
    }

    // ── 6. Extract metadata ────────────────────
    const items = cb.CallbackMetadata?.Item || [];
    const meta = Object.fromEntries(
      items.map((i) => [i.Name, i.Value]).filter(([_, v]) => v !== undefined),
    );

    const amount = new Decimal(meta.Amount || 0);
    const mpesaRef = meta.MpesaReceiptNumber || null;
    const phone = meta.PhoneNumber
      ? normalizePhone(String(meta.PhoneNumber))
      : null;

    if (amount.lte(0)) {
      logger.error("Callback missing valid amount", { ...ctx, meta });
      return;
    }

    // ── 7. Atomic claim ────────────────────────
    const claimed = await prisma.mpesaTransaction.updateMany({
      where: { checkoutRequestId: checkoutReqId, status: "pending" },
      data: { status: "processing" },
    });

    if (claimed.count === 0) {
      logger.warn("No pending transaction found to claim", ctx);
      return;
    }

    // ── 8. Fetch claimed transaction ───────────
    const tx = await prisma.mpesaTransaction.findFirst({
      where: { checkoutRequestId: checkoutReqId, status: "processing" },
    });

    if (!tx) {
      logger.error("Claimed transaction disappeared", ctx);
      return;
    }

    // ── 9. Amount verification ─────────────────
    const expectedAmount = new Decimal(tx.amount);
    if (!amount.equals(expectedAmount)) {
      logger.error("Amount mismatch in callback — aborting credit", {
        ...ctx,
        expected: expectedAmount.toFixed(2),
        received: amount.toFixed(2),
      });
      await prisma.mpesaTransaction.update({
        where: { id: tx.id },
        data: { status: "failed", resultDesc: "Amount mismatch detected" },
      });
      await redis.setex(processedKey, 86400, "failed").catch(e => logger.error("Redis setex failed", { error: e.message }));
      return;
    }

    // ── 10. Process wallet credit ──────────────
    try {
      const bundleService = require("../src/services/bundleService");
      const bundleTx = await prisma.transaction.findFirst({
        where: { mpesaCheckoutId: checkoutReqId },
      });
      if (bundleTx) {
        if (bundleTx.category === 'second_hand') {
          const secondHandService = require('../src/services/secondHandService')
          await secondHandService.processSecondHandPayment(tx, amount, mpesaRef, bundleTx)
        } else {
          await bundleService.processEscrowPayment(tx, amount, mpesaRef, bundleTx)
        }
      } else {
        // ── STK fallback send — check if this was a wallet-insufficient send ──
        const stkSendKey = `stk_send:${tx.checkoutRequestId}`
        const stkSendData = await redis.get(stkSendKey)
        if (stkSendData) {
          sendCtx = JSON.parse(stkSendData)
          await redis.del(stkSendKey)
          const { initiateB2C } = require('../src/utils/mpesaB2C')
          const Decimal = require('decimal.js')
          const platformWalletId = await getPlatformWalletId()
          const sendAmount = new Decimal(sendCtx.amount)
          const platformFee = new Decimal(sendCtx.platformFee)
          const totalDeduct = new Decimal(sendCtx.totalDeduct)
          // Credit platform fee
          await prisma.$transaction(async (db) => {
            await db.wallet.update({
              where: { id: platformWalletId },
              data: { availableBalance: { increment: platformFee.toFixed(2) }, totalIn: { increment: platformFee.toFixed(2) }, lastUpdated: new Date() }
            })
            await db.walletTransaction.create({
              data: { toWallet: { connect: { id: platformWalletId } }, amount: platformFee.toFixed(2), type: 'platform_fee', status: 'completed', reference: `${sendCtx.reference}-fee`, note: `Platform fee for STK fallback send ${sendCtx.reference}` }
            })
            await db.walletTransaction.create({
              data: { toWallet: { connect: { id: platformWalletId } }, amount: sendAmount.toFixed(2), type: 'send', status: 'pending', reference: sendCtx.reference, note: `STK fallback send to ${sendCtx.recipientPhone} via M-Pesa` }
            })
          })
            
          // Persist refund context — stk_send key is already gone, but the B2C payout can still fail
          await redis.set(`b2c_refund:${sendCtx.reference}`, JSON.stringify({
            senderId:    sendCtx.senderId,
            senderPhone: sendCtx.senderPhone,
            totalDeduct: sendCtx.totalDeduct,
            amount:      sendCtx.amount,
          }), 'EX', 86400)

          // Fire B2C to recipient
          await initiateB2C({
            phone: sendCtx.recipientPhone,
            amount: sendAmount.toNumber(),
            originatorId: sendCtx.reference,
            transactionId: sendCtx.reference,
            remarks: `LipaSafe send ${sendCtx.reference}`,
          })
          await redis.set(`originator:${sendCtx.reference}`, `wallet_send:${sendCtx.reference}`, 'EX', 86400)
          logger.info('STK fallback send — B2C fired', { reference: sendCtx.reference, recipientPhone: sendCtx.recipientPhone, amount: sendCtx.amount })
        } else {
          await processSuccessfulPayment(tx, amount, mpesaRef, ctx);
        }
      }

      await redis.setex(processedKey, 86400, "completed").catch(e => logger.error("Redis setex failed", { error: e.message }));

      logger.info("Wallet credited successfully", {
        ...ctx,
        userId: tx.userId,
        amount: amount.toFixed(2),
        mpesaRef,
      });
    } catch (error) {
      // ── Failure: Mark as failed ──────────────
      await prisma.mpesaTransaction.update({
        where: { id: tx.id },
        data: { status: "failed", resultDesc: error.message },
      });

      logger.error(
        "Wallet credit transaction failed — FULL ERROR: " +
          error.message +
          " STACK: " +
          error.stack,
        {
          ...ctx,
          userId: tx.userId,
          error: error.message,
        },
      );

      // STK-send fallback: sender's M-Pesa cash already left their account
      // before this failure — enqueue the refund instead of relying solely
      // on a webhook alert + manual recovery.
      if (sendCtx?.reference) {
        try {
          await b2cRetryQueue.add('stk_send_refund', { type: 'stk_send_refund', reference: sendCtx.reference })
          logger.warn("STK-send B2C failed — refund job enqueued", { reference: sendCtx.reference })
        } catch (queueErr) {
          logger.error("CRITICAL: failed to enqueue stk_send_refund — manual refund required", { reference: sendCtx.reference, err: queueErr.message })
        }
      }
      // Alert on critical failure
      if (process.env.ALERT_WEBHOOK) {
        try {
          await axios.post(process.env.ALERT_WEBHOOK, {
            text: `CRITICAL: M-Pesa deposit failed after callback acceptance. TX: ${tx.id}, User: ${tx.userId}, Amount: ${amount.toFixed(2)}`,
          });
        } catch (alertErr) {
          logger.error("Failed to send alert", { error: alertErr.message });
        }
      }
    }
  } catch (error) {
    logger.error("Callback handler crashed", {
      ...ctx,
      error: error.message,
      stack: error.stack,
    });
  }
};

// ─── POLL STATUS ─────────────────────────────
const PollStatusSchema = z.object({
  checkoutRequestId: z.string().min(1),
});

const pollStatus = async (req, res) => {
  const ctx = getRequestContext(req);

  try {
    const parseResult = PollStatusSchema.safeParse(req.params);
    if (!parseResult.success) {
      throw new ValidationError("Invalid checkout request ID");
    }

    const { checkoutRequestId } = parseResult.data;
    const userId = req.user.userId;
    ctx.userId = userId;

    // Optional: Check Redis for fast lookup
    const cachedStatus = await redis.get(`mpesa:status:${checkoutRequestId}`);
    if (cachedStatus) {
      return res.json({ success: true, ...JSON.parse(cachedStatus) });
    }

    const tx = await prisma.mpesaTransaction.findFirst({
      where: { checkoutRequestId, userId },
      select: {
        id: true,
        status: true,
        amount: true,
        mpesaRef: true,
        resultDesc: true,
        phone: true,
        createdAt: true,
        processedAt: true,
      },
    });

    if (!tx) {
      throw new MpesaError("Transaction not found", "TX_NOT_FOUND", 404);
    }

    const result = {
      success: true,
      ...tx,
      amount: tx.amount?.toString() || null,
    };

    if (tx.status === "completed" || tx.status === "failed") {
      await redis.setex(
        `mpesa:status:${checkoutRequestId}`,
        10,
        JSON.stringify(result),
      );
    }

    return res.json(result);
  } catch (error) {
    logger.error("Poll status failed", { ...ctx, error: error.message });

    if (error instanceof MpesaError && error.isOperational) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Server error",
    });
  }
};

// \u2500\u2500\u2500 TRANSACTION RECONCILIATION (cron job) \u2500\u2500\u2500
const safaricomThrottle = require('../src/utils/safaricomThrottle')

// Inline circuit breaker for the STK query endpoint (separate from STK push)
const _reconcileCB = (() => {
  let state = 'CLOSED', failCount = 0, lastFailTime = null
  const RECOVERY_MS = 65_000, THRESHOLD = 2
  return {
    isOpen () {
      if (state !== 'OPEN') return false
      if (Date.now() - lastFailTime >= RECOVERY_MS) { state = 'HALF-OPEN'; return false }
      return true
    },
    secsLeft ()      { return Math.ceil((RECOVERY_MS - (Date.now() - lastFailTime)) / 1000) },
    onSuccess ()     { state = 'CLOSED'; failCount = 0; lastFailTime = null },
    onFailure (code) { failCount++; lastFailTime = Date.now(); if (code === 429 || failCount >= THRESHOLD) state = 'OPEN' },
    getState ()      { return state }
  }
})()

const reconcilePendingTransactions = async () => {
  logger.info('Starting M-Pesa reconciliation')

  // ── Auto-expire anything pending >30 mins — Safaricom won't honour these ──
  const expiryCutoff = new Date(Date.now() - 30 * 60 * 1000)
  const expired = await prisma.mpesaTransaction.updateMany({
    where: { status: 'pending', createdAt: { lte: expiryCutoff } },
    data:  { status: 'failed', resultDesc: 'Auto-expired: no callback within 30 minutes' },
  })
  if (expired.count > 0) logger.info(`Auto-expired ${expired.count} stale pending transaction(s)`)

  // ── Only query Safaricom for transactions 5–30 mins old ──
  const pendingCutoff = new Date(Date.now() - 5 * 60 * 1000)
  const freshCutoff   = new Date(Date.now() - 30 * 60 * 1000)

  const pendingTxs = await prisma.mpesaTransaction.findMany({
    where: { status: 'pending', createdAt: { lte: pendingCutoff, gte: freshCutoff } },
    take: 100,
  })

  logger.info(`Found ${pendingTxs.length} pending transactions to reconcile`)

  for (const tx of pendingTxs) {

    // ── Circuit breaker check — bail if Safaricom is 429-ing us ──
    if (_reconcileCB.isOpen()) {
      logger.warn(
        `[Reconciliation] Circuit OPEN — aborting run. Retry in ${_reconcileCB.secsLeft()}s`
      )
      break
    }

    try {
      // ── Throttle BEFORE calling Safaricom (13s gap + 5/min window) ──
      await safaricomThrottle.wait()

      const token = await getToken()

      const response = await axios.post(
        `${baseURL}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: MPESA_SHORTCODE,
          ...(()=>{
            const _ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
            return {
              Password: Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${_ts}`).toString('base64'),
              Timestamp: _ts,
            };
          })(),
          CheckoutRequestID: tx.checkoutRequestId,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      )

      _reconcileCB.onSuccess()
      const data = response.data

      if (data.ResultCode === '0') {
        logger.warn('Found completed transaction via reconciliation', {
          txId: tx.id,
          checkoutRequestId: tx.checkoutRequestId,
        })
        const processedKey     = `mpesa:callback:${tx.checkoutRequestId}`
        const alreadyProcessed = await redis.get(processedKey)
        if (!alreadyProcessed) {
          const fresh = await prisma.mpesaTransaction.findUnique({ where: { id: tx.id } })
          if (fresh?.status === 'completed') {
            await redis.setex(processedKey, 86400, 'completed')
          } else {
            const amount   = new Decimal(tx.amount).plus(new Decimal(tx.fee || 0))
            const mpesaRef = data.ReceiptNumber || 'RECONCILED'
            // ── Mirror callback routing: escrow/second-hand before wallet credit ──
            const bundleService    = require('../src/services/bundleService')
            const secondHandService = require('../src/services/secondHandService')
            const bundleTx = await prisma.transaction.findFirst({
              where: { mpesaCheckoutId: tx.checkoutRequestId },
            })
            if (bundleTx) {
              if (bundleTx.category === 'second_hand') {
                await secondHandService.processSecondHandPayment(tx, amount, mpesaRef, bundleTx)
              } else {
                await bundleService.processEscrowPayment(tx, amount, mpesaRef, bundleTx)
              }
            } else {
              await processSuccessfulPayment(tx, amount, mpesaRef, { requestId: 'reconciliation' })
            }
            await redis.setex(processedKey, 86400, 'completed')
          }
        }
      } else if (['1', '1032', '1037'].includes(data.ResultCode)) {
        await prisma.mpesaTransaction.update({
          where: { id: tx.id },
          data: {
            status:     'failed',
            resultDesc: data.ResultDesc || `Reconciliation failed: ${data.ResultCode}`,
          },
        })
        logger.info('Transaction marked failed via reconciliation', { txId: tx.id })
      }

    } catch (err) {
      console.error(err)
      const status = err?.response?.status
      _reconcileCB.onFailure(status)

      // Circuit just opened — abort the whole run
      if (_reconcileCB.getState() === 'OPEN') {
        logger.warn(`[Reconciliation] Circuit opened (status=${status}) — aborting run`)
        break
      }

      logger.error('Reconciliation failed for transaction', {
        txId:  tx.id,
        status,
        error: err.message,
      })
    }
  }

  logger.info('M-Pesa reconciliation completed')
}

// ─── RECEIVE (STK PUSH TO SENDER) ────────────
const receiveRequest = async (req, res) => {
  const ctx = getRequestContext(req);

  try {
    const schema = z.object({
      senderPhone: z
        .string()
        .regex(/^(?:254|0|\+254)?[17]\d{8}$/, "Invalid phone"),
      amount: z.coerce.number().min(1).max(150000),
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const receiverId = req.user.userId;
    const senderPhone = normalizePhone(parsed.data.senderPhone);
    const amount = parsed.data.amount;

    // Rate limit
    try {
      await checkRateLimit(receiverId);
    } catch (err) {
      if (err instanceof RateLimitError) throw err;

      logger.error(
        "Rate limit check failed — Redis down, allowing request",
        {
          receiverId,
          err: err.message,
        }
      );
    }

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: {
        phone: true,
        accountStatus: true,
      },
    });

    if (!receiver) {
      throw new MpesaError(
        "User not found",
        "USER_NOT_FOUND",
        404
      );
    }

    if (receiver.accountStatus !== "active") {
      throw new MpesaError(
        "Account not active",
        "ACCOUNT_INACTIVE",
        403
      );
    }

    if (receiver.phone === senderPhone) {
      throw new ValidationError(
        "Cannot request from yourself"
      );
    }
    const parsedAmount = toKsh(amount)

    const feeAmount = parsedAmount
      .times(0.02)
      .toNearest(1, Decimal.ROUND_HALF_UP);

    const totalAmount = parsedAmount
      .plus(feeAmount)
      .toNearest(1, Decimal.ROUND_HALF_UP)
      .toNumber();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      `${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    const token = await getToken();

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: totalAmount,
      PartyA: senderPhone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: senderPhone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: "LipaSafe",
      TransactionDesc: "Payment Request",
    };

    const response = await mpesaCircuitBreaker.execute(() =>
      withRetry(() =>
        axios.post(
          `${baseURL}/mpesa/stkpush/v1/processrequest`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 30000,
          }
        )
      )
    );

    const data = response.data;

    if (data.ResponseCode !== "0") {
      throw new MpesaError(
        data.ResponseDescription || "STK push failed",
        "MPESA_ERROR",
        400
      );
    }

    await prisma.mpesaTransaction.create({
      data: {
        userId: receiverId,
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID,
        amount: parsedAmount.toFixed(2),
        fee: feeAmount.toFixed(2),
        phone: senderPhone,
        status: "pending",
        idempotencyKey: generateIdempotencyKey(),
      },
    });

    logger.info(
      "Receive STK push initiated",
      {
        receiverId,
        senderPhone,
        amount: totalAmount,
      }
    );

    return res.json({
      success: true,
      message: "STK push sent to sender",
      checkoutRequestId: data.CheckoutRequestID,
    });

  } catch (error) {
    console.error("ReceiveRequest Error:", error);

    if (
      error instanceof MpesaError &&
      error.isOperational
    ) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "An internal server error occurred",
    });
  }
};
module.exports = {
  stkPush,
  callback,
  pollStatus,
  receiveRequest,
  reconcilePendingTransactions,
};