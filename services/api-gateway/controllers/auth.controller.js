"use strict";
const logger = require("../src/utils/logger");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { z } = require("zod");
const prisma = require("../src/utils/prisma");
const redis = require("../src/utils/redis");
const { sendOTP } = require("../src/utils/email");

// ─── CONSTANTS ───────────────────────────────────
const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_SECONDS = 600;
const IS_DEV = false;
const OTP_MAX_ATTEMPTS = 5;
const JWT_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

// ─── HELPERS ─────────────────────────────────────
const generateOTP = () => crypto.randomInt(100000, 999999).toString();

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  const refreshToken = jwt.sign(
    payload,
    process.env.REFRESH_SECRET || process.env.JWT_SECRET + "_refresh",
    { expiresIn: REFRESH_EXPIRY },
  );
  return { accessToken, refreshToken };
};

const sanitizeEmail = (email) => email.trim().toLowerCase();
const sanitizePhone = (phone) => {
  const cleaned = phone.trim().replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10)
    return "254" + cleaned.slice(1);
  if (cleaned.startsWith("+254")) return cleaned.slice(1);
  return cleaned;
};
const safeError = (res, status, message) =>
  res.status(status).json({ success: false, message });

// ─── VALIDATION SCHEMAS ──────────────────────────
const registerSchema = z.object({
  phone: z.string().min(9).max(15),
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
});
const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});
const setPinSchema = z.object({
  email: z.string().email(),
  pin: z.string().length(4).regex(/^\d+$/, "PIN must be 4 digits"),
});
const loginSchema = z.object({
  phone: z.string().min(9).max(15),
  pin: z.string().length(4).regex(/^\d+$/, "PIN must be 4 digits"),
});
const forgotPinSchema = z.object({
  phone: z.string().min(9).max(15),
});
const resetPinSchema = z.object({
  phone: z.string().min(9).max(15),
  otp: z.string().length(6),
  pin: z.string().length(4).regex(/^\d+$/, "PIN must be 4 digits"),
});

// ─── REGISTER ────────────────────────────────────
const register = async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return safeError(res, 400, "Invalid input");

    const { fullName } = parsed.data;
    const phone = sanitizePhone(parsed.data.phone);
    const email = sanitizeEmail(parsed.data.email);

    const rateLimitKey = `ratelimit:register:${req.ip}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 3600);
    if (!IS_DEV && attempts > 3)
      return safeError(res, 429, "Too many attempts. Try again later.");

    const existing = await prisma.user.findFirst({
      where: { OR: [{ phone }, { email }] },
    });
    const isGhost = existing?.pinHash === "GHOST";
    if (existing && !isGhost)
      return safeError(res, 400, "Account already exists");

    const otp = generateOTP();
    const otpKey = `otp:${email}`;
    const otpAttemptsKey = `otp:${email}:attempts`;
    await redis.setex(otpKey, OTP_EXPIRY_SECONDS, otp);
    await redis.setex(otpAttemptsKey, OTP_EXPIRY_SECONDS, "0");

    const pendingKey = `pending:${email}`;
    await redis.setex(
      pendingKey,
      OTP_EXPIRY_SECONDS,
      JSON.stringify({ phone, fullName, email }),
    );

    await sendOTP(email, otp);

    return res
      .status(200)
      .json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    logger.error("register error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── VERIFY OTP ──────────────────────────────────
const verifyOtp = async (req, res) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) return safeError(res, 400, "Invalid input");

    const email = sanitizeEmail(parsed.data.email);
    const { otp } = parsed.data;

    const otpAttemptsKey = `otp:${email}:attempts`;
    const attempts = await redis.incr(otpAttemptsKey);
    if (attempts > OTP_MAX_ATTEMPTS)
      return safeError(res, 429, "Too many attempts. Request a new OTP.");

    const otpKey = `otp:${email}`;
    const storedOtp = await redis.get(otpKey);
    if (!storedOtp)
      return safeError(res, 400, "OTP expired. Please register again.");
    if (storedOtp !== otp) return safeError(res, 400, "Invalid OTP");

    const pendingKey = `pending:${email}`;
    const pendingData = await redis.get(pendingKey);
    if (!pendingData)
      return safeError(res, 400, "Session expired. Please register again.");

    await redis.del(otpKey);
    await redis.del(otpAttemptsKey);

    const verifiedKey = `verified:${email}`;
    await redis.setex(verifiedKey, OTP_EXPIRY_SECONDS, pendingData);

    return res
      .status(200)
      .json({ success: true, message: "OTP verified. Set your PIN." });
  } catch (err) {
    logger.error("verifyOtp error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── SET PIN ─────────────────────────────────────
const setPin = async (req, res) => {
  try {
    const parsed = setPinSchema.safeParse(req.body);
    console.error(parsed)
    if (!parsed.success) return safeError(res, 400, "Invalid input");

    const email = sanitizeEmail(parsed.data.email);
    const { pin } = parsed.data;

    const verifiedKey = `verified:${email}`;
    const verifiedData = await redis.get(verifiedKey);
    if (!verifiedData)
      return safeError(res, 400, "Session expired. Please register again.");

    const { phone, fullName } = JSON.parse(verifiedData);
    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    // ── Ghost upgrade: if this phone was a ghost seller, upgrade in place ──
    const { normalizePhone } = require("../src/services/bundleService");
    const normalizedPhone = normalizePhone(phone);
    const ghost = await prisma.user.findFirst({
      where: { phone: { in: [phone, normalizedPhone] }, pinHash: "GHOST" },
      include: { wallet: true },
    });
    let user;
    if (ghost && ghost.pinHash === "GHOST") {
      user = await prisma.user.update({
        where: { phone },
        data: {
          fullName,
          email,
          pinHash,
          role: "buyer",
          accountStatus: "active",
          kycStatus: "unverified",
          updatedAt: new Date(),
        },
      });
      if (ghost.wallet?.isGhost) {
        await prisma.wallet.update({
          where: { userId: user.id },
          data: { isGhost: false },
        });
      }
    } else {
      user = await prisma.user.create({
        data: { phone: normalizedPhone, fullName, email, pinHash },
      });
      await prisma.wallet.create({ data: { userId: user.id } });
    }
    await redis.del(verifiedKey);

    const payload = { userId: user.id, phone: user.phone, role: user.role };
    const { accessToken, refreshToken } = generateTokens(payload);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus,
      },
    });
  } catch (err) {
    logger.error("setPin error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── LOGIN ───────────────────────────────────────
const login = async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return safeError(res, 400, "Invalid input");

    const phone = sanitizePhone(parsed.data.phone);
    const { pin } = parsed.data;

    const rateLimitKey = `ratelimit:login:${phone}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 900);
    if (attempts > 5)
      return safeError(res, 429, "Too many attempts. Try again in 15 minutes.");

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return safeError(res, 401, "Invalid phone or PIN");

    if (user.accountStatus === "banned")
      return safeError(res, 403, "Account banned. Contact support.");
    if (user.accountStatus === "suspended")
      return safeError(res, 403, "Account suspended. Contact support.");
    if (user.accountStatus === "frozen")
      return safeError(res, 403, "Account frozen. Contact support.");

    const pinMatch = await bcrypt.compare(pin, user.pinHash);
    if (!pinMatch) return safeError(res, 401, "Invalid phone or PIN");

    await redis.del(rateLimitKey);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const payload = { userId: user.id, phone: user.phone, role: user.role };
    const { accessToken, refreshToken } = generateTokens(payload);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus,
        accountStatus: user.accountStatus,
      },
    });
  } catch (err) {
    logger.error("login error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── FORGOT PIN ──────────────────────────────────
const forgotPin = async (req, res) => {
  try {
    const parsed = forgotPinSchema.safeParse(req.body);
    if (!parsed.success) return safeError(res, 400, "Invalid input");

    const phone = sanitizePhone(parsed.data.phone);

    const rateLimitKey = `ratelimit:forgotpin:${req.ip}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 3600);
    if (attempts > 5)
      return safeError(res, 429, "Too many requests. Try again in 1 hour.");

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user)
      return res
        .status(200)
        .json({
          success: true,
          message: "If this number exists, an OTP has been sent.",
        });

    const otp = generateOTP();
    await redis.setex(`resetpin:otp:${phone}`, OTP_EXPIRY_SECONDS, otp);
    await redis.del(`resetpin:attempts:${phone}`);
    await sendOTP(user.email, otp, "reset");

    return res
      .status(200)
      .json({
        success: true,
        message: "If this number exists, an OTP has been sent.",
      });
  } catch (err) {
    logger.error("forgotPin error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── RESET PIN ───────────────────────────────────
const resetPin = async (req, res) => {
  try {
    const parsed = resetPinSchema.safeParse(req.body);
    if (!parsed.success) return safeError(res, 400, "Invalid input");

    const phone = sanitizePhone(parsed.data.phone);
    const { otp, pin } = parsed.data;

    const attemptsKey = `resetpin:attempts:${phone}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_EXPIRY_SECONDS);
    if (attempts > OTP_MAX_ATTEMPTS)
      return safeError(res, 429, "Too many attempts. Request a new OTP.");

    const storedOtp = await redis.get(`resetpin:otp:${phone}`);
    if (!storedOtp || storedOtp !== otp)
      return safeError(res, 400, "Invalid or expired OTP.");

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return safeError(res, 404, "User not found");

    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { phone }, data: { pinHash } });
    await redis.del(`resetpin:otp:${phone}`, `resetpin:attempts:${phone}`);

    return res
      .status(200)
      .json({ success: true, message: "PIN reset successfully." });
  } catch (err) {
    logger.error("resetPin error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── REQUEST PIN CHANGE OTP (authenticated) ──────
const requestPinChangeOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return safeError(res, 404, "User not found");

    const rateLimitKey = `ratelimit:changepin:${userId}`;
    const attempts = await redis.incr(rateLimitKey);
    if (attempts === 1) await redis.expire(rateLimitKey, 3600);
    if (attempts > 5)
      return safeError(res, 429, "Too many attempts. Try again later.");

    const otp = generateOTP();
    await redis.setex(`changepin:otp:${userId}`, OTP_EXPIRY_SECONDS, otp);
    await redis.setex(`changepin:otp:${userId}:attempts`, OTP_EXPIRY_SECONDS, "0");
    await sendOTP(user.email, otp, "changepin");

    return res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    logger.error("requestPinChangeOtp error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── VERIFY PIN CHANGE OTP (authenticated) ───────
const verifyPinChangeOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;
    if (!otp || typeof otp !== "string" || otp.length !== 6)
      return safeError(res, 400, "Invalid OTP");

    const attemptsKey = `changepin:otp:${userId}:attempts`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts > OTP_MAX_ATTEMPTS)
      return safeError(res, 429, "Too many attempts. Request a new OTP.");

    const storedOtp = await redis.get(`changepin:otp:${userId}`);
    if (!storedOtp) return safeError(res, 400, "OTP expired. Request a new one.");
    if (storedOtp !== otp) return safeError(res, 400, "Invalid OTP");

    await redis.del(`changepin:otp:${userId}`);
    await redis.del(attemptsKey);
    await redis.setex(`changepin:verified:${userId}`, OTP_EXPIRY_SECONDS, "1");

    return res.status(200).json({ success: true, message: "OTP verified. Enter your current PIN." });
  } catch (err) {
    logger.error("verifyPinChangeOtp error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

// ─── CONFIRM PIN CHANGE (authenticated) ──────────
const confirmPinChangeSchema = z.object({
  oldPin: z.string().length(4).regex(/^\d+$/, "PIN must be 4 digits"),
  newPin: z.string().length(4).regex(/^\d+$/, "PIN must be 4 digits"),
});
const confirmPinChange = async (req, res) => {
  try {
    const userId = req.user.id;

    const verifiedKey = `changepin:verified:${userId}`;
    const verified = await redis.get(verifiedKey);
    if (!verified) return safeError(res, 400, "Please verify OTP first");

    const parsed = confirmPinChangeSchema.safeParse(req.body);
    if (!parsed.success) return safeError(res, 400, "Invalid input");
    const { oldPin, newPin } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return safeError(res, 404, "User not found");

    const pinMatch = await bcrypt.compare(oldPin, user.pinHash);
    if (!pinMatch) return safeError(res, 401, "Current PIN is incorrect");

    const newPinHash = await bcrypt.hash(newPin, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { pinHash: newPinHash } });
    await redis.del(verifiedKey);

    return res.status(200).json({ success: true, message: "PIN changed successfully" });
  } catch (err) {
    logger.error("confirmPinChange error", { err });
    return safeError(res, 500, "Something went wrong");
  }
};

const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res.status(400).json({ success: false, message: "No token" });

    // Decode to get expiry
    const decoded = jwt.decode(token);
    const ttlSeconds = Math.floor(decoded.exp - Date.now() / 1000);

    if (ttlSeconds > 0) {
      // Blacklist the token until it expires
      await redis.setex(`blacklist:${token}`, ttlSeconds, "1");
    }

    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    logger.error("logout error", { err });
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};
module.exports = {
  register,
  verifyOtp,
  setPin,
  login,
  forgotPin,
  resetPin,
  logout,
  requestPinChangeOtp,
  verifyPinChangeOtp,
  confirmPinChange,
};
