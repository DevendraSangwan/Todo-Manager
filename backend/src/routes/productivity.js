import { Router } from "express";
import { z } from "zod";
import Category from "../models/Category.js";
import DailyProductivity from "../models/DailyProductivity.js";
import FocusSession from "../models/FocusSession.js";
import Goal from "../models/Goal.js";
import Habit from "../models/Habit.js";
import TaskHistory from "../models/TaskHistory.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { updateDailyProductivity } from "../utils/productivity.js";

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const focusSettingsSchema = z.object({
  focusMinutes: z.number().int().min(1).max(180),
  shortBreakMinutes: z.number().int().min(1).max(60),
  longBreakMinutes: z.number().int().min(1).max(120),
  longBreakInterval: z.number().int().min(2).max(8)
}).strict();
router.use(requireAuth);

router.get("/my-day", async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await updateDailyProductivity(req.user._id, today);
    const start = new Date(`${today}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const now = new Date();
    const [todayTodos, overdueTodos, categories, habits, dailyRecord, user] = await Promise.all([
      Todo.find({ userId: req.user.id, deletedAt: null, dueDate: { $gte: start, $lt: end } })
        .populate("categoryId", "name color")
        .populate("dependencies", "title status")
        .sort({ status: 1, priority: 1, dueDate: 1 }).lean(),
      Todo.find({ userId: req.user.id, deletedAt: null, status: "pending", dueDate: { $lt: start } })
        .populate("categoryId", "name color")
        .populate("dependencies", "title status")
        .sort({ dueDate: 1 }).limit(50).lean(),
      Category.find({ userId: req.user.id }).sort({ name: 1 }).lean(),
      Habit.find({ userId: req.user.id }).sort({ name: 1 }).lean(),
      DailyProductivity.findOne({ userId: req.user.id, date: today }).lean(),
      User.findById(req.user.id).select("xp currentStreak bestStreak lastStreakDate dailyGoalHours leaderboardOptIn focusSettings").lean()
    ]);
    const priorityRank = { "urgent-important": 0, high: 0, "important-not-urgent": 1, medium: 1, "urgent-not-important": 2, neither: 3, low: 3 };
    const topPriorities = [...todayTodos]
      .filter((todo) => todo.status === "pending")
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 3);
    const completed = todayTodos.filter((todo) => todo.status === "completed").length;
    const percentage = todayTodos.length ? Math.round((completed / todayTodos.length) * 100) : 0;
    const counts = await Todo.aggregate([
      { $match: { userId: req.user._id, deletedAt: null, categoryId: { $ne: null } } },
      { $group: { _id: "$categoryId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } } }
    ]);
    const categoryProgress = categories.map((category) => {
      const count = counts.find((entry) => String(entry._id) === String(category._id));
      return { ...category, total: count?.total ?? 0, completed: count?.completed ?? 0 };
    });
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const currentStreak = [today, yesterday].includes(user.lastStreakDate) ? user.currentStreak : 0;
    return res.json({
      date: today,
      todayTodos,
      overdueTodos,
      topPriorities,
      completed,
      total: todayTodos.length,
      progress: percentage,
      xp: user.xp,
      currentStreak,
      bestStreak: user.bestStreak,
      dailyGoalHours: user.dailyGoalHours,
      leaderboardOptIn: user.leaderboardOptIn,
      focusSettings: user.focusSettings,
      categories: categoryProgress,
      habits: habits.map((habit) => ({ ...habit, completedToday: habit.completedDates.includes(today) })),
      dailyRecord,
      generatedAt: now
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/profile", async (req, res, next) => {
  try {
    const parsed = z.object({
      leaderboardOptIn: z.boolean().optional(),
      focusSettings: focusSettingsSchema.optional()
    }).strict().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
      return res.status(400).json({ message: "Provide valid leaderboard or focus preferences." });
    }
    const updates = {};
    if (parsed.data.leaderboardOptIn !== undefined) updates.leaderboardOptIn = parsed.data.leaderboardOptIn;
    if (parsed.data.focusSettings) {
      for (const [key, value] of Object.entries(parsed.data.focusSettings)) updates[`focusSettings.${key}`] = value;
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true })
      .select("leaderboardOptIn focusSettings xp currentStreak bestStreak");
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

router.get("/leaderboard", async (req, res, next) => {
  try {
    if (req.user.role !== "STUDENT" || req.user.accountType !== "class" || !req.user.classId) {
      return res.status(403).json({ message: "The class leaderboard is available only to class members." });
    }
    if (!req.user.leaderboardOptIn) {
      return res.status(403).json({ message: "Opt in to view the class leaderboard." });
    }
    const classmates = await User.find({
      classId: req.user.classId,
      accountType: "class",
      role: "STUDENT",
      leaderboardOptIn: true
    }).select("email xp currentStreak").sort({ xp: -1, _id: 1 }).limit(100).lean();
    return res.json({
      leaderboard: classmates.map((classmate, index) => ({
        rank: index + 1,
        name: classmate.email.split("@")[0],
        xp: classmate.xp,
        currentStreak: classmate.currentStreak,
        isYou: String(classmate._id) === req.user.id
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/focus-sessions", async (req, res, next) => {
  try {
    const parsed = z.object({
      todoId: objectIdSchema,
      type: z.enum(["focus", "short-break", "long-break"]),
      minutes: z.number().int().min(1).max(600)
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Select a todo and provide a valid session duration." });
    const todo = await Todo.findOne({ _id: parsed.data.todoId, userId: req.user.id, deletedAt: null });
    if (!todo) return res.status(404).json({ message: "Todo not found." });
    if (parsed.data.type === "focus" && (todo.actualMinutes ?? 0) + parsed.data.minutes > 100000) {
      return res.status(400).json({ message: "The logged time exceeds the maximum supported for this todo." });
    }
    let actualMinutes = todo.actualMinutes;
    if (parsed.data.type === "focus") {
      const updatedTodo = await Todo.findOneAndUpdate(
        { _id: todo._id, userId: req.user.id },
        { $inc: { actualMinutes: parsed.data.minutes } },
        { new: true }
      );
      if (!updatedTodo) return res.status(404).json({ message: "Todo not found." });
      actualMinutes = updatedTodo.actualMinutes;
      await TaskHistory.create({
        todoId: todo._id,
        ownerId: todo.userId,
        classId: todo.classId,
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: "updated",
        changes: [{ field: "actualMinutes", oldValue: todo.actualMinutes, newValue: actualMinutes }]
      });
    }
    const session = await FocusSession.create({ ...parsed.data, userId: req.user.id });
    return res.status(201).json({ session, actualMinutes });
  } catch (error) {
    return next(error);
  }
});

router.get("/categories", async (req, res, next) => {
  try {
    const categories = await Category.find({ userId: req.user.id }).sort({ name: 1 }).lean();
    const counts = await Todo.aggregate([
      { $match: { userId: req.user._id, deletedAt: null, categoryId: { $ne: null } } },
      { $group: { _id: "$categoryId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } } }
    ]);
    return res.json({ categories: categories.map((category) => {
      const count = counts.find((entry) => String(entry._id) === String(category._id));
      return { ...category, total: count?.total ?? 0, completed: count?.completed ?? 0 };
    }) });
  } catch (error) {
    return next(error);
  }
});

router.post("/categories", async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(40),
      color: z.string().regex(/^#[a-f\d]{6}$/i).optional()
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a category name and valid color." });
    const category = await Category.create({ ...parsed.data, userId: req.user.id });
    return res.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "You already have a category with that name." });
    return next(error);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    if (!objectIdSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Category ID is not valid." });
    const category = await Category.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!category) return res.status(404).json({ message: "Category not found." });
    await Todo.updateMany({ userId: req.user.id, categoryId: category._id }, { $set: { categoryId: null } });
    return res.json({ message: "Category deleted." });
  } catch (error) {
    return next(error);
  }
});

router.get("/goals", async (req, res, next) => {
  try {
    const goals = await Goal.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.json({ goals });
  } catch (error) {
    return next(error);
  }
});

router.post("/goals", async (req, res, next) => {
  try {
    const parsed = z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).optional().default(""),
      targetDate: dateSchema.optional(),
      milestones: z.array(z.string().trim().min(1).max(120)).max(30).optional().default([])
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a goal and valid milestones." });
    const goal = await Goal.create({
      userId: req.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      targetDate: parsed.data.targetDate ? new Date(`${parsed.data.targetDate}T12:00:00.000Z`) : null,
      milestones: parsed.data.milestones.map((title) => ({ title }))
    });
    return res.status(201).json({ goal });
  } catch (error) {
    return next(error);
  }
});

router.patch("/goals/:id/milestones/:index", async (req, res, next) => {
  try {
    if (!objectIdSchema.safeParse(req.params.id).success || !/^\d+$/.test(req.params.index)) {
      return res.status(400).json({ message: "Goal or milestone ID is not valid." });
    }
    const parsed = z.object({ completed: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Milestone completion must be true or false." });
    const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.id });
    const index = Number(req.params.index);
    if (!goal || !goal.milestones[index]) return res.status(404).json({ message: "Milestone not found." });
    goal.milestones[index].completed = parsed.data.completed;
    goal.milestones[index].completedAt = parsed.data.completed ? new Date() : null;
    await goal.save();
    return res.json({ goal });
  } catch (error) {
    return next(error);
  }
});

router.delete("/goals/:id", async (req, res, next) => {
  try {
    if (!objectIdSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Goal ID is not valid." });
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!goal) return res.status(404).json({ message: "Goal not found." });
    return res.json({ message: "Goal deleted." });
  } catch (error) {
    return next(error);
  }
});

router.get("/habits", async (req, res, next) => {
  try {
    const habits = await Habit.find({ userId: req.user.id }).sort({ name: 1 }).lean();
    return res.json({ habits });
  } catch (error) {
    return next(error);
  }
});

router.post("/habits", async (req, res, next) => {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a habit name." });
    const habit = await Habit.create({ ...parsed.data, userId: req.user.id });
    return res.status(201).json({ habit });
  } catch (error) {
    return next(error);
  }
});

router.patch("/habits/:id/today", async (req, res, next) => {
  try {
    if (!objectIdSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Habit ID is not valid." });
    const parsed = z.object({ completed: z.boolean(), date: dateSchema.optional() }).strict().safeParse(req.body);
    if (!parsed.success || (parsed.data.date && !dateSchema.safeParse(parsed.data.date).success)) {
      return res.status(400).json({ message: "Provide a valid habit status and date." });
    }
    const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user.id });
    if (!habit) return res.status(404).json({ message: "Habit not found." });
    habit.completedDates = parsed.data.completed
      ? [...new Set([...habit.completedDates, date])]
      : habit.completedDates.filter((entry) => entry !== date);
    await habit.save();
    return res.json({ habit });
  } catch (error) {
    return next(error);
  }
});

router.delete("/habits/:id", async (req, res, next) => {
  try {
    if (!objectIdSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Habit ID is not valid." });
    const habit = await Habit.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!habit) return res.status(404).json({ message: "Habit not found." });
    return res.json({ message: "Habit deleted." });
  } catch (error) {
    return next(error);
  }
});

router.get("/streak", async (req, res, next) => {
  try {
    const records = await DailyProductivity.find({ userId: req.user.id }).sort({ date: -1 }).limit(60).lean();
    const user = await User.findById(req.user.id).select("xp currentStreak bestStreak lastStreakDate").lean();
    return res.json({ records, ...user, today: new Date().toISOString().slice(0, 10) });
  } catch (error) {
    return next(error);
  }
});

export default router;
