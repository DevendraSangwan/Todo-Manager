import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import User from "../models/User.js";
import Class from "../models/Class.js";
import AccessRequest from "../models/AccessRequest.js";
import { requireAuth } from "../middleware/auth.js";
import { isConfiguredSuperAdmin } from "../utils/roles.js";

const router = Router();
const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." }
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

function issueSession(user, res) {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, cookieOptions);
  return publicUser(user);
}

router.post("/register", async (req, res, next) => {
  try {
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
      role: isSuperAdmin ? "SUPER_ADMIN" : "STUDENT",
      accountType: isSuperAdmin ? "personal" : null,
      setupComplete: isSuperAdmin
    });
    return res.status(201).json({ user: issueSession(user, res) });
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
      .select("_id email password role accountType setupComplete classId chronotype dailyGoalHours interests leaderboardOptIn xp currentStreak bestStreak lastStreakDate focusSettings");
    const passwordMatches = user && (await bcrypt.compare(parsed.data.password, user.password));
    if (!passwordMatches) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    if (isConfiguredSuperAdmin(user.email) &&
        (user.role !== "SUPER_ADMIN" || user.accountType !== "personal" || !user.setupComplete)) {
      user = await User.findByIdAndUpdate(
        user._id,
        { $set: { role: "SUPER_ADMIN", accountType: "personal", setupComplete: true, classId: null } },
        { new: true, runValidators: true }
      ).select("_id email role accountType setupComplete classId chronotype dailyGoalHours interests leaderboardOptIn xp currentStreak bestStreak lastStreakDate focusSettings");
    }

    return res.json({ user: issueSession(user, res) });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  return res.json({ message: "Logged out." });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
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
