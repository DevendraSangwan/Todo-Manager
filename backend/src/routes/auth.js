import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import User from "../models/User.js";
import Class from "../models/Class.js";
import AccessRequest from "../models/AccessRequest.js";
import AuthToken from "../models/AuthToken.js";
import Session from "../models/Session.js";
import { createAndSendAuthToken, hashAuthToken } from "../services/authTokens.js";
import { smtpConfigured } from "../services/email.js";
import { requireAuth } from "../middleware/auth.js";
import { isConfiguredSuperAdmin } from "../utils/roles.js";

const router = Router();
const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});
const authRateLimitWindowMs = process.env.NODE_ENV === "production"
  ? 15 * 60 * 1000
  : 60 * 1000;
const loginLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." }
});
const authActionLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again in 15 minutes." }
});
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    theme: user.theme,
    timezone: user.timezone,
    notificationPreferences: user.notificationPreferences,
    reminderMinutes: user.reminderMinutes,
    aiDataPermission: user.aiDataPermission,
    reducedMotion: user.reducedMotion,
    role: user.role,
    accountType: user.accountType,
    setupComplete: user.setupComplete,
    classId: user.classId ?? null,
    chronotype: user.chronotype,
    dailyGoalHours: user.dailyGoalHours,
    interests: user.interests,
    leaderboardOptIn: user.leaderboardOptIn,
    xp: user.xp,
    currentStreak: user.currentStreak,
    bestStreak: user.bestStreak,
    lastStreakDate: user.lastStreakDate,
    focusSettings: user.focusSettings
  };
}

async function issueSession(user, req, res) {
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await Session.create({
    userId: user._id,
    tokenId,
    userAgent: String(req.get("user-agent") ?? "").slice(0, 300),
    ipAddress: String(req.ip ?? "").slice(0, 64),
    expiresAt
  });
  const token = jwt.sign({ sub: user.id, jti: tokenId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, cookieOptions);
  return publicUser(user);
}

router.post("/register", authActionLimiter, async (req, res, next) => {
  try {
    if (!smtpConfigured()) return res.status(503).json({ message: "Email delivery is unavailable. Configure SMTP before creating an account." });
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter a valid email and a password of at least 8 characters." });
    }

    const existingUser = await User.exists({ email: parsed.data.email });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const password = await bcrypt.hash(parsed.data.password, 12);
    const isSuperAdmin = isConfiguredSuperAdmin(parsed.data.email);
    const user = await User.create({
      email: parsed.data.email,
      password,
      emailVerified: false,
      role: isSuperAdmin ? "SUPER_ADMIN" : "STUDENT",
      accountType: isSuperAdmin ? "personal" : null,
      setupComplete: isSuperAdmin
    });
    try {
      await createAndSendAuthToken(user, "verify_email");
    } catch (error) {
      await AuthToken.deleteMany({ userId: user._id });
      await User.deleteOne({ _id: user._id });
      return next(error);
    }
    return res.status(201).json({ message: "Check your email for a verification link before logging in." });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    return next(error);
  }
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Enter a valid email and password." });
    }

    let user = await User.findOne({ email: parsed.data.email })
      .select("+password")
      .select("_id email emailVerified displayName theme timezone notificationPreferences reminderMinutes aiDataPermission reducedMotion password role accountType setupComplete classId chronotype dailyGoalHours interests leaderboardOptIn xp currentStreak bestStreak lastStreakDate focusSettings");
    const passwordMatches = user && (await bcrypt.compare(parsed.data.password, user.password));
    if (!passwordMatches) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ message: "Verify your email address before logging in. You can request a new verification link." });
    }

    if (isConfiguredSuperAdmin(user.email) &&
        (user.role !== "SUPER_ADMIN" || user.accountType !== "personal" || !user.setupComplete)) {
      user = await User.findByIdAndUpdate(
        user._id,
        { $set: { role: "SUPER_ADMIN", accountType: "personal", setupComplete: true, classId: null } },
        { new: true, runValidators: true }
      ).select("_id email emailVerified displayName theme timezone notificationPreferences reminderMinutes aiDataPermission reducedMotion role accountType setupComplete classId chronotype dailyGoalHours interests leaderboardOptIn xp currentStreak bestStreak lastStreakDate focusSettings");
    }

    return res.json({ user: await issueSession(user, req, res) });
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-email", authActionLimiter, async (req, res, next) => {
  try {
    const parsed = z.string().regex(/^[a-f\d]{64}$/i).safeParse(req.body?.token);
    if (!parsed.success) return res.status(400).json({ message: "Verification link is not valid." });
    const token = await AuthToken.findOne({
      tokenHash: hashAuthToken(parsed.data),
      purpose: "verify_email",
      expiresAt: { $gt: new Date() }
    });
    if (!token) return res.status(400).json({ message: "Verification link is invalid or expired." });
    await User.updateOne({ _id: token.userId }, { $set: { emailVerified: true } });
    await AuthToken.deleteMany({ userId: token.userId, purpose: "verify_email" });
    return res.json({ message: "Email verified. You can now log in." });
  } catch (error) {
    return next(error);
  }
});

router.post("/resend-verification", authActionLimiter, async (req, res, next) => {
  try {
    if (!smtpConfigured()) return res.status(503).json({ message: "Email delivery is unavailable. Configure SMTP and try again." });
    const parsed = z.string().trim().email().max(254).safeParse(req.body?.email);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email address." });
    const user = await User.findOne({ email: parsed.data.toLowerCase() });
    if (user && !user.emailVerified) await createAndSendAuthToken(user, "verify_email");
    return res.json({ message: "If the account needs verification, a new link has been sent." });
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", authActionLimiter, async (req, res, next) => {
  try {
    if (!smtpConfigured()) return res.status(503).json({ message: "Email delivery is unavailable. Configure SMTP and try again." });
    const parsed = z.string().trim().email().max(254).safeParse(req.body?.email);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email address." });
    const user = await User.findOne({ email: parsed.data.toLowerCase() });
    if (user) await createAndSendAuthToken(user, "reset_password");
    return res.json({ message: "If an account exists for that address, password reset instructions have been sent." });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", authActionLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({
      token: z.string().regex(/^[a-f\d]{64}$/i),
      password: z.string().min(8).max(128)
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a valid reset link and a password of at least 8 characters." });
    const token = await AuthToken.findOne({
      tokenHash: hashAuthToken(parsed.data.token),
      purpose: "reset_password",
      expiresAt: { $gt: new Date() }
    });
    if (!token) return res.status(400).json({ message: "Password reset link is invalid or expired." });
    const password = await bcrypt.hash(parsed.data.password, 12);
    await User.updateOne({ _id: token.userId }, { $set: { password } });
    await Promise.all([
      Session.deleteMany({ userId: token.userId }),
      AuthToken.deleteMany({ userId: token.userId })
    ]);
    return res.json({ message: "Password updated. Log in with your new password." });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const payload = jwt.decode(token);
      if (payload && typeof payload === "object" && typeof payload.jti === "string") {
        await Session.deleteOne({ tokenId: payload.jti });
      }
    }
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/"
    });
    return res.json({ message: "Logged out." });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const sessions = await Session.find({ userId: req.user.id, expiresAt: { $gt: new Date() } })
      .select("_id tokenId userAgent ipAddress createdAt")
      .sort({ createdAt: -1 }).lean();
    return res.json({
      sessions: sessions.map((session) => ({
        id: session._id,
        current: session.tokenId === req.authTokenId,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout-others", requireAuth, async (req, res, next) => {
  try {
    const result = await Session.deleteMany({ userId: req.user.id, tokenId: { $ne: req.authTokenId } });
    return res.json({ message: "Other sessions have been logged out.", revoked: result.deletedCount });
  } catch (error) {
    return next(error);
  }
});

const setupSchema = z.discriminatedUnion("accountType", [
  z.object({
    accountType: z.literal("personal"),
    chronotype: z.enum(["morning", "night"]),
    dailyGoalHours: z.number().min(0.5).max(16),
    interests: z.array(z.string().trim().min(1).max(40)).max(12)
  }).strict(),
  z.object({
    accountType: z.literal("class"),
    classId: z.string().regex(/^[a-f\d]{24}$/i),
    chronotype: z.enum(["morning", "night"]),
    dailyGoalHours: z.number().min(0.5).max(16),
    interests: z.array(z.string().trim().min(1).max(40)).max(12)
  }).strict()
]);

router.post("/setup", requireAuth, async (req, res, next) => {
  try {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success || req.user.setupComplete || req.user.role !== "STUDENT") {
      return res.status(400).json({ message: "Account setup is invalid or already complete." });
    }
    if (parsed.data.accountType === "personal") {
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: {
          accountType: "personal", classId: null, setupComplete: true,
          chronotype: parsed.data.chronotype, dailyGoalHours: parsed.data.dailyGoalHours,
          interests: parsed.data.interests
        } },
        { new: true, runValidators: true }
      );
      return res.json({ user: publicUser(user) });
    }

    const classroom = await Class.findById(parsed.data.classId).select("_id");
    if (!classroom) return res.status(404).json({ message: "Class not found." });
    const request = await AccessRequest.create({
      requesterId: req.user.id,
      classId: classroom._id,
      kind: "join_class"
    });
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: {
        accountType: "class", classId: null, setupComplete: true,
        chronotype: parsed.data.chronotype, dailyGoalHours: parsed.data.dailyGoalHours,
        interests: parsed.data.interests
      } },
      { new: true, runValidators: true }
    );
    return res.status(201).json({ user: publicUser(user), request });
  } catch (error) {
    return next(error);
  }
});

export default router;
