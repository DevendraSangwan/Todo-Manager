import { Router } from "express";
import bcrypt from "bcryptjs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import AccessRequest from "../models/AccessRequest.js";
import AIAction from "../models/AIAction.js";
import Announcement from "../models/Announcement.js";
import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import AuthToken from "../models/AuthToken.js";
import Category from "../models/Category.js";
import DailyProductivity from "../models/DailyProductivity.js";
import FocusSession from "../models/FocusSession.js";
import Goal from "../models/Goal.js";
import Habit from "../models/Habit.js";
import Notification from "../models/Notification.js";
import ReminderDelivery from "../models/ReminderDelivery.js";
import SavedFilter from "../models/SavedFilter.js";
import Session from "../models/Session.js";
import TaskHistory from "../models/TaskHistory.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";
import Class from "../models/Class.js";
import { smtpConfigured } from "../services/email.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const notificationSchema = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  browser: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0);
const settingsSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  timezone: z.string().trim().min(1).max(80).refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Timezone is not supported."),
  notificationPreferences: notificationSchema.optional(),
  reminderMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).optional(),
  aiDataPermission: z.boolean().optional(),
  reducedMotion: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0);

router.use(requireAuth);

router.get("/", (req, res) => {
  res.json({
    settings: {
      displayName: req.user.displayName,
      email: req.user.email,
      theme: req.user.theme,
      timezone: req.user.timezone,
      notificationPreferences: req.user.notificationPreferences,
      reminderMinutes: req.user.reminderMinutes,
      aiDataPermission: req.user.aiDataPermission,
      reducedMotion: req.user.reducedMotion
    }
  });
});

router.patch("/", async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide valid profile and preference settings." });
    if (parsed.data.notificationPreferences?.email === true && !smtpConfigured()) {
      return res.status(503).json({ message: "Email reminders are unavailable until the server is configured with SMTP." });
    }
    const updates = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (key === "notificationPreferences") {
        for (const [preference, enabled] of Object.entries(value)) {
          updates[`notificationPreferences.${preference}`] = enabled;
        }
      } else {
        updates[key] = value;
      }
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true, runValidators: true })
      .select("_id email emailVerified displayName theme timezone notificationPreferences reminderMinutes aiDataPermission reducedMotion role accountType setupComplete classId chronotype dailyGoalHours interests leaderboardOptIn aiAlwaysAllowActions xp currentStreak bestStreak lastStreakDate focusSettings")
      .lean();
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function collectExport(userId) {
  const [user, todos, goals, habits, categories, productivity, focusSessions, submissions, history, filters, aiActions, notifications, requests, authoredAssignments, authoredAnnouncements] = await Promise.all([
    User.findById(userId).select("-password -__v").lean(),
    Todo.find({ userId }).select("-__v").sort({ createdAt: 1 }).lean(),
    Goal.find({ userId }).select("-__v").lean(),
    Habit.find({ userId }).select("-__v").lean(),
    Category.find({ userId }).select("-__v").lean(),
    DailyProductivity.find({ userId }).select("-__v").lean(),
    FocusSession.find({ userId }).select("-__v").lean(),
    AssignmentSubmission.find({ studentId: userId }).select("-__v").populate("assignmentId", "title description dueDate").lean(),
    TaskHistory.find({ ownerId: userId }).select("-__v").lean(),
    SavedFilter.find({ userId }).select("-__v").lean(),
    AIAction.find({ userId }).select("-__v").lean(),
    Notification.find({ $or: [{ senderId: userId }, { recipientId: userId }] }).select("-__v").lean(),
    AccessRequest.find({ $or: [{ requesterId: userId }, { recipientId: userId }] }).select("-__v").lean(),
    Assignment.find({ teacherId: userId }).select("-__v").lean(),
    Announcement.find({ teacherId: userId }).select("-__v").lean()
  ]);
  const teacherAssignments = authoredAssignments.map(({ studentIds, ...assignment }) => ({
    ...assignment,
    assignedStudentCount: studentIds.length
  }));
  return [
    { type: "profile", data: user },
    ...todos.map((data) => ({ type: "todo", data })),
    ...goals.map((data) => ({ type: "goal", data })),
    ...habits.map((data) => ({ type: "habit", data })),
    ...categories.map((data) => ({ type: "category", data })),
    ...productivity.map((data) => ({ type: "daily_productivity", data })),
    ...focusSessions.map((data) => ({ type: "focus_session", data })),
    ...submissions.map((data) => ({ type: "assignment_submission", data })),
    ...history.map((data) => ({ type: "task_history", data })),
    ...filters.map((data) => ({ type: "saved_filter", data })),
    ...aiActions.map((data) => ({ type: "ai_action", data })),
    ...notifications.map((data) => ({ type: "notification", data })),
    ...requests.map((data) => ({ type: "access_request", data })),
    ...teacherAssignments.map((data) => ({ type: "authored_assignment", data })),
    ...authoredAnnouncements.map((data) => ({ type: "authored_announcement", data }))
  ];
}

router.get("/export", async (req, res, next) => {
  try {
    const format = z.enum(["csv", "pdf"]).safeParse(req.query.format ?? "csv");
    if (!format.success) return res.status(400).json({ message: "Export format must be csv or pdf." });
    const records = await collectExport(req.user._id);
    const filename = `daymark-personal-data.${format.data}`;
    if (format.data === "csv") {
      const rows = [
        ["type", "id", "created_at", "data"].map(csvValue).join(","),
        ...records.map(({ type, data }) => [
          type,
          data._id ?? "",
          data.createdAt?.toISOString?.() ?? "",
          JSON.stringify(data)
        ].map(csvValue).join(","))
      ];
      res.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      });
      return res.send(`\uFEFF${rows.join("\r\n")}`);
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`
    });
    const document = new PDFDocument({ margin: 48, size: "A4" });
    document.pipe(res);
    document.fontSize(20).text("Daymark personal data export");
    document.moveDown().fontSize(9).text(`Generated ${new Date().toISOString()} · ${records.length} records`);
    for (const { type, data } of records) {
      document.moveDown().fontSize(12).text(type.replaceAll("_", " ").toUpperCase());
      const printableJson = JSON.stringify(data, null, 2).replace(/[^\x20-\x7E]/g, (character) =>
        `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
      );
      document.fontSize(8).text(printableJson, { width: 500 });
      if (document.y > 700) document.addPage();
    }
    document.end();
    return undefined;
  } catch (error) {
    return next(error);
  }
});

router.delete("/account", async (req, res, next) => {
  try {
    const parsed = z.object({
      password: z.string().min(8).max(128),
      confirmation: z.literal("DELETE")
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Enter your password and type "DELETE" to confirm.' });
    if (req.user.role === "SUPER_ADMIN") return res.status(403).json({ message: "A super-admin account cannot be deleted from settings." });
    const account = await User.findById(req.user.id).select("+password");
    if (!account || !(await bcrypt.compare(parsed.data.password, account.password))) {
      return res.status(401).json({ message: "Password is incorrect." });
    }

    const assignments = await Assignment.find({ teacherId: account._id }).select("_id").lean();
    const assignmentIds = assignments.map(({ _id }) => _id);
    await Promise.all([
      Todo.deleteMany({ userId: account._id }),
      Goal.deleteMany({ userId: account._id }),
      Habit.deleteMany({ userId: account._id }),
      Category.deleteMany({ userId: account._id }),
      DailyProductivity.deleteMany({ userId: account._id }),
      FocusSession.deleteMany({ userId: account._id }),
      SavedFilter.deleteMany({ userId: account._id }),
      AIAction.deleteMany({ userId: account._id }),
      TaskHistory.deleteMany({ $or: [{ ownerId: account._id }, { actorId: account._id }] }),
      Notification.deleteMany({ $or: [{ senderId: account._id }, { recipientId: account._id }] }),
      ReminderDelivery.deleteMany({ userId: account._id }),
      AccessRequest.deleteMany({ $or: [{ requesterId: account._id }, { recipientId: account._id }] }),
      AssignmentSubmission.deleteMany({
        $or: [{ studentId: account._id }, ...(assignmentIds.length ? [{ assignmentId: { $in: assignmentIds } }] : [])]
      }),
      Assignment.updateMany({ studentIds: account._id }, { $pull: { studentIds: account._id } }),
      Assignment.deleteMany({ teacherId: account._id }),
      Announcement.deleteMany({ teacherId: account._id }),
      AuthToken.deleteMany({ userId: account._id }),
      Session.deleteMany({ userId: account._id }),
      Class.updateMany({ teacherId: account._id }, { $set: { teacherId: null } })
    ]);
    await User.deleteOne({ _id: account._id });
    res.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return res.json({ message: "Your account and personal data have been deleted." });
  } catch (error) {
    return next(error);
  }
});

export default router;
