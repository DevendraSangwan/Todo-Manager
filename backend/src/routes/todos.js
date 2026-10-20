import { Router } from "express";
import { z } from "zod";
import Todo from "../models/Todo.js";
import Class from "../models/Class.js";
import User from "../models/User.js";
import AccessRequest from "../models/AccessRequest.js";
import TaskHistory from "../models/TaskHistory.js";
import SavedFilter from "../models/SavedFilter.js";
import Category from "../models/Category.js";
import { requireAuth } from "../middleware/auth.js";
import { updateDailyProductivity } from "../utils/productivity.js";

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priorities = ["urgent-important", "important-not-urgent", "urgent-not-important", "neither"];
const prioritySchema = z.enum([...priorities, "low", "medium", "high"]);
const ownerOnlyTodoFields = ["estimatedMinutes", "actualMinutes", "xpAwarded", "categoryId", "dependencies"];
function hideOwnerOnlyTodoFields(todo) {
  const sharedTodo = { ...todo };
  for (const field of ownerOnlyTodoFields) delete sharedTodo[field];
  return sharedTodo;
}
const subtaskSchema = z.object({
  _id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  title: z.string().trim().min(1).max(120),
  completed: z.boolean().optional().default(false)
});
const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  priority: z.enum(priorities).optional().default("important-not-urgent"),
  dueDate: z.string().datetime({ offset: true }),
  estimatedMinutes: z.number().int().min(0).max(100000).optional().default(0),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional().default(null),
  dependencies: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(30).optional().default([])
    .refine((ids) => !ids || new Set(ids).size === ids.length, "Dependencies must be unique."),
  subtasks: z.array(subtaskSchema).max(30).optional().default([]),
  repeatFrequency: z.enum(["daily", "weekly", "monthly"]).nullable().optional().default(null),
  visibility: z.enum(["private", "classmates", "public"]).optional().default("private")
});
const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: prioritySchema.optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  estimatedMinutes: z.number().int().min(0).max(100000).optional(),
  actualMinutes: z.number().int().min(0).max(100000).optional(),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  dependencies: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(30).optional()
    .refine((ids) => !ids || new Set(ids).size === ids.length, "Dependencies must be unique."),
  subtasks: z.array(subtaskSchema).max(30).optional(),
  repeatFrequency: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  visibility: z.enum(["private", "classmates", "public"]).optional(),
  status: z.enum(["pending", "completed"]).optional(),
  completionNote: z.string().trim().max(1000).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided."
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const pageValue = Number(req.query.page ?? 1);
    const limitValue = Number(req.query.limit ?? 10);
    if (!Number.isInteger(pageValue) || pageValue < 1 ||
        !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 50) {
      return res.status(400).json({ message: "Page must be positive and limit must be between 1 and 50." });
    }

    const filter = { userId: req.user.id, deletedAt: null };
    if (req.query.status !== undefined) {
      const status = z.enum(["pending", "completed"]).safeParse(req.query.status);
      if (!status.success) {
        return res.status(400).json({ message: "Status must be pending or completed." });
      }
      filter.status = status.data;
    }
    if (req.query.date !== undefined) {
      const date = dateSchema.safeParse(req.query.date);
      if (!date.success) {
        return res.status(400).json({ message: "Date must use YYYY-MM-DD format." });
      }
      const start = new Date(`${date.data}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date.data) {
        return res.status(400).json({ message: "Date is not valid." });
      }
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.dueDate = { $gte: start, $lt: end };
    }
    if (req.query.from !== undefined || req.query.to !== undefined) {
      const range = {};
      for (const [key, bound] of [["from", "$gte"], ["to", "$lt"]]) {
        if (req.query[key] === undefined) continue;
        const date = dateSchema.safeParse(req.query[key]);
        if (!date.success) return res.status(400).json({ message: "Date range values must use YYYY-MM-DD format." });
        const parsedDate = new Date(`${date.data}T00:00:00.000Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date.data) {
          return res.status(400).json({ message: "Date range contains an invalid date." });
        }
        range[bound] = parsedDate;
      }
      if (range.$gte && range.$lt && range.$gte >= range.$lt) {
        return res.status(400).json({ message: "The end date must be after the start date." });
      }
      filter.dueDate = range;
    }
    if (req.query.q !== undefined) {
      const query = z.string().trim().max(120).safeParse(req.query.q);
      if (!query.success) return res.status(400).json({ message: "Search text must be 120 characters or fewer." });
      const escaped = query.data.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["title", "description", "completionNote"].map((field) => ({
        [field]: { $regex: escaped, $options: "i" }
      }));
    }
    if (req.query.priority !== undefined && req.query.priority !== "") {
      const priority = z.enum(priorities).safeParse(req.query.priority);
      if (!priority.success) return res.status(400).json({ message: "Priority is not valid." });
      filter.priority = priority.data === "urgent-important"
        ? { $in: [priority.data, "high"] }
        : priority.data === "important-not-urgent"
          ? { $in: [priority.data, "medium"] }
          : priority.data === "neither"
            ? { $in: [priority.data, "low"] }
            : priority.data;
    }
    if (req.query.overdue === "true") {
      filter.status = "pending";
      filter.dueDate = { $lt: new Date() };
    } else if (req.query.overdue !== undefined && req.query.overdue !== "false") {
      return res.status(400).json({ message: "Overdue must be true or false." });
    }

    const [todos, total] = await Promise.all([
      Todo.find(filter)
        .populate("categoryId", "name color")
        .populate("dependencies", "title status")
        .sort({ dueDate: 1, createdAt: -1 })
        .skip((pageValue - 1) * limitValue)
        .limit(limitValue)
        .lean(),
      Todo.countDocuments(filter)
    ]);

    return res.json({
      todos,
      pagination: {
        page: pageValue,
        limit: limitValue,
        total,
        pages: Math.ceil(total / limitValue)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/calendar", async (req, res, next) => {
  try {
    const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).safeParse(req.query.month);
    if (!month.success) return res.status(400).json({ message: "Month must use YYYY-MM format." });
    const start = new Date(`${month.data}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const days = await Todo.aggregate([
      { $match: { userId: req.user._id, deletedAt: null, dueDate: { $gte: start, $lt: end } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$dueDate", timezone: "UTC" } }, count: { $sum: 1 } } }
    ]);
    return res.json({ days: Object.fromEntries(days.map(({ _id, count }) => [_id, count])) });
  } catch (error) {
    return next(error);
  }
});

router.get("/matrix", async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Page must be positive and limit must be between 1 and 50." });
    }
    const filter = { userId: req.user.id, deletedAt: null };
    const [todos, total] = await Promise.all([
      Todo.find(filter).sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Todo.countDocuments(filter)
    ]);
    return res.json({ todos, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return next(error);
  }
});

router.get("/reports/daily", async (req, res, next) => {
  try {
    const date = dateSchema.safeParse(req.query.date);
    if (!date.success) return res.status(400).json({ message: "Date must use YYYY-MM-DD format." });
    const start = new Date(`${date.data}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date.data) {
      return res.status(400).json({ message: "Date is not valid." });
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const counts = await Todo.aggregate([
      { $match: { userId: req.user._id, deletedAt: null, dueDate: { $gte: start, $lt: end } } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const completed = counts.find(({ _id }) => _id === "completed")?.count ?? 0;
    const pending = counts.find(({ _id }) => _id === "pending")?.count ?? 0;
    const total = completed + pending;
    return res.json({
      date: date.data,
      total,
      completed,
      pending,
      completionPercentage: total ? Math.round((completed / total) * 100) : 0,
      chart: [{ name: "Completed", count: completed }, { name: "Pending", count: pending }]
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/trash", async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Page must be positive and limit must be between 1 and 50." });
    }
    const filter = { userId: req.user.id, deletedAt: { $ne: null } };
    const [todos, total] = await Promise.all([
      Todo.find(filter).sort({ deletedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Todo.countDocuments(filter)
    ]);
    return res.json({ todos, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return next(error);
  }
});

router.get("/history/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Todo ID is not valid." });
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.user.id }).select("_id").lean();
    if (!todo) return res.status(404).json({ message: "Todo not found." });
    const history = await TaskHistory.find({ todoId: todo._id, ownerId: req.user.id })
      .sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ history });
  } catch (error) {
    return next(error);
  }
});

router.get("/saved-filters", async (req, res, next) => {
  try {
    const filters = await SavedFilter.find({ userId: req.user.id }).sort({ name: 1 }).lean();
    return res.json({ filters });
  } catch (error) {
    return next(error);
  }
});

router.post("/saved-filters", async (req, res, next) => {
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(60),
      filters: z.object({
        search: z.string().trim().max(120).optional().default(""),
        status: z.enum(["pending", "completed", "all"]).optional().default("all"),
        priority: z.union([z.enum(priorities), z.literal("")]).optional().default(""),
        date: z.union([dateSchema, z.literal("")]).optional().default(""),
        overdue: z.boolean().optional().default(false)
      }).strict()
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a filter name and valid filter options." });
    const savedFilter = await SavedFilter.create({ ...parsed.data, userId: req.user.id });
    return res.status(201).json({ filter: savedFilter });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A saved filter with that name already exists." });
    return next(error);
  }
});

router.delete("/saved-filters/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Filter ID is not valid." });
    const savedFilter = await SavedFilter.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!savedFilter) return res.status(404).json({ message: "Saved filter not found." });
    return res.json({ message: "Saved filter deleted." });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({ message: "Todo ID is not valid." });
    }
    const todo = await Todo.findById(req.params.id).lean();
    if (!todo || todo.deletedAt) return res.status(404).json({ message: "Todo not found." });

    if (String(todo.userId) !== req.user.id) {
      const publicTodo = todo.visibility === "public";
      const classmatesTodo = todo.visibility === "classmates" &&
        req.user.accountType === "class" &&
        req.user.classId &&
        String(todo.classId) === String(req.user.classId);
      const friendship = !publicTodo && !classmatesTodo && todo.visibility !== "private" && await AccessRequest.exists({
        requesterId: req.user.id,
        recipientId: todo.userId,
        kind: "friend_access",
        status: "approved"
      });
      if (!publicTodo && !classmatesTodo && !friendship) {
        return res.status(403).json({ message: "You cannot read this todo." });
      }
      return res.json({ todo: hideOwnerOnlyTodoFields(todo) });
    }
    return res.json({ todo });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createTodoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Check the todo fields and try again." });
    }
    if (parsed.data.categoryId && !await Category.exists({ _id: parsed.data.categoryId, userId: req.user.id })) {
      return res.status(400).json({ message: "Choose one of your own categories." });
    }
    if (parsed.data.dependencies.length) {
      const dependencies = await Todo.find({
        _id: { $in: parsed.data.dependencies }, userId: req.user.id, deletedAt: null
      }).select("_id").lean();
      if (dependencies.length !== parsed.data.dependencies.length) {
        return res.status(400).json({ message: "Dependencies must be active todos that belong to you." });
      }
    }
    const classId = req.user.role === "STUDENT" && req.user.accountType === "class" ? req.user.classId : null;
    const todo = await Todo.create({
      ...parsed.data,
      dueDate: new Date(parsed.data.dueDate),
      categoryId: parsed.data.categoryId,
      userId: req.user.id,
      classId
    });
    await TaskHistory.create({
      todoId: todo._id, ownerId: todo.userId, classId: todo.classId,
      actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
      action: "created",
      changes: [{ field: "title", oldValue: null, newValue: todo.title }]
    });
    await updateDailyProductivity(req.user._id, todo.dueDate.toISOString().slice(0, 10));
    return res.status(201).json({ todo });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({ message: "Todo ID is not valid." });
    }
    const parsed = updateTodoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Check the todo update fields and try again." });
    }
    if (parsed.data.status === "pending") {
      parsed.data.completionNote = "";
    }

    const currentTodo = await Todo.findById(req.params.id);
    if (!currentTodo || currentTodo.deletedAt) return res.status(404).json({ message: "Todo not found." });

    const isOwner = String(currentTodo.userId) === req.user.id;
    let isClassTeacher = false;
    if (!isOwner && req.user.role === "TEACHER_ADMIN" && currentTodo.classId) {
      const [classroom, student] = await Promise.all([
        Class.findOne({ _id: currentTodo.classId, teacherId: req.user.id }).select("_id").lean(),
        User.findOne({
          _id: currentTodo.userId,
          role: "STUDENT",
          accountType: "class",
          classId: currentTodo.classId
        }).select("_id").lean()
      ]);
      isClassTeacher = Boolean(classroom && student);
    }
    if (!isOwner && !isClassTeacher) {
      return res.status(403).json({ message: "You cannot edit this todo." });
    }
    if (!isOwner && ["estimatedMinutes", "actualMinutes", "categoryId", "dependencies"].some((field) => field in parsed.data)) {
      return res.status(403).json({ message: "Only the todo owner can change personal productivity details." });
    }

    if (parsed.data.status === "pending" && currentTodo.status === "completed") {
      const completedDependent = await Todo.exists({
        userId: currentTodo.userId,
        dependencies: currentTodo._id,
        status: "completed",
        deletedAt: null
      });
      if (completedDependent) {
        return res.status(409).json({ message: "Reopen dependent todos before reopening this prerequisite." });
      }
    }
    if (parsed.data.status === "completed" && currentTodo.dependencies.length) {
      const completedDependencies = await Todo.countDocuments({
        _id: { $in: currentTodo.dependencies }, userId: currentTodo.userId, status: "completed", deletedAt: null
      });
      if (completedDependencies !== currentTodo.dependencies.length) {
        return res.status(409).json({ message: "Complete this todo’s prerequisites before marking it complete." });
      }
    }
    if (isOwner && parsed.data.categoryId && !await Category.exists({ _id: parsed.data.categoryId, userId: req.user.id })) {
      return res.status(400).json({ message: "Choose one of your own categories." });
    }
    if (isOwner && parsed.data.dependencies) {
      const existingDependencies = await Todo.find({
        _id: { $in: parsed.data.dependencies },
        userId: req.user.id,
        deletedAt: null,
        createdAt: { $lt: currentTodo.createdAt }
      }).select("_id").lean();
      if (existingDependencies.length !== parsed.data.dependencies.length ||
          parsed.data.dependencies.some((dependencyId) => String(dependencyId) === String(currentTodo._id))) {
        return res.status(400).json({ message: "Dependencies must be active earlier todos that belong to you." });
      }
    }

    const previousDueDate = currentTodo.dueDate.toISOString().slice(0, 10);
    const changes = [];
    for (const [field, value] of Object.entries(parsed.data)) {
      const nextValue = field === "dueDate" ? new Date(value) : value;
      const oldValue = currentTodo[field];
      if (JSON.stringify(oldValue) !== JSON.stringify(nextValue)) {
        changes.push({ field, oldValue: oldValue ?? null, newValue: nextValue });
        currentTodo.set(field, nextValue);
      }
    }
    await currentTodo.save();
    if (changes.length) {
      await TaskHistory.create({
        todoId: currentTodo._id, ownerId: currentTodo.userId, classId: currentTodo.classId,
        actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
        action: "updated", changes
      });
    }
    const productivityDates = new Set();
    if (changes.some(({ field }) => field === "status")) {
      productivityDates.add(currentTodo.dueDate.toISOString().slice(0, 10));
    }
    if (changes.some(({ field }) => field === "dueDate")) {
      productivityDates.add(previousDueDate);
      productivityDates.add(currentTodo.dueDate.toISOString().slice(0, 10));
    }
    if (productivityDates.size) {
      const rewards = [];
      if (isOwner && currentTodo.status === "completed" && !currentTodo.xpAwarded) {
        const reward = await Todo.updateOne(
          { _id: currentTodo._id, $or: [{ xpAwarded: false }, { xpAwarded: { $exists: false } }] },
          { $set: { xpAwarded: true } }
        );
        if (reward.modifiedCount) rewards.push(User.updateOne({ _id: req.user.id }, { $inc: { xp: 10 } }));
      }
      for (const date of productivityDates) rewards.push(updateDailyProductivity(currentTodo.userId, date));
      await Promise.all(rewards);
    }

    if (parsed.data.status === "completed" &&
        currentTodo.repeatFrequency &&
        !currentTodo.nextOccurrenceCreated &&
        changes.some(({ field }) => field === "status")) {
      const nextDate = new Date(currentTodo.dueDate);
      if (currentTodo.repeatFrequency === "daily") nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      if (currentTodo.repeatFrequency === "weekly") nextDate.setUTCDate(nextDate.getUTCDate() + 7);
      if (currentTodo.repeatFrequency === "monthly") {
        const dayOfMonth = nextDate.getUTCDate();
        nextDate.setUTCDate(1);
        nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, 0)).getUTCDate();
        nextDate.setUTCDate(Math.min(dayOfMonth, lastDay));
      }
      currentTodo.nextOccurrenceCreated = true;
      await currentTodo.save();
      const nextTodo = await Todo.create({
        userId: currentTodo.userId, classId: currentTodo.classId,
        title: currentTodo.title, description: currentTodo.description,
        priority: currentTodo.priority, dueDate: nextDate, status: "pending",
        visibility: currentTodo.visibility, repeatFrequency: currentTodo.repeatFrequency,
        estimatedMinutes: currentTodo.estimatedMinutes,
        categoryId: currentTodo.categoryId,
        dependencies: currentTodo.dependencies,
        subtasks: currentTodo.subtasks.map(({ title }) => ({ title, completed: false }))
      });
      await TaskHistory.create({
        todoId: nextTodo._id, ownerId: nextTodo.userId, classId: nextTodo.classId,
        actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
        action: "created",
        changes: [{ field: "recurringFrom", oldValue: currentTodo._id, newValue: nextTodo.dueDate }]
      });
      await updateDailyProductivity(currentTodo.userId, nextDate.toISOString().slice(0, 10));
    }
    const todo = isOwner ? currentTodo : hideOwnerOnlyTodoFields(currentTodo.toObject());
    return res.json({ todo });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({ message: "Todo ID is not valid." });
    }
    const todo = await Todo.findById(req.params.id);
    if (!todo) {
      return res.status(404).json({ message: "Todo not found." });
    }
    const isOwner = String(todo.userId) === req.user.id;
    let isClassTeacher = false;
    if (!isOwner && req.user.role === "TEACHER_ADMIN" && todo.classId) {
      const [classroom, student] = await Promise.all([
        Class.findOne({ _id: todo.classId, teacherId: req.user.id }).select("_id").lean(),
        User.findOne({ _id: todo.userId, role: "STUDENT", accountType: "class", classId: todo.classId }).select("_id").lean()
      ]);
      isClassTeacher = Boolean(classroom && student);
    }
    if (!isOwner && !isClassTeacher) return res.status(403).json({ message: "You cannot delete this todo." });
    if (todo.deletedAt) return res.status(404).json({ message: "Todo not found." });
    const hasDependents = await Todo.exists({
      userId: todo.userId,
      dependencies: todo._id,
      deletedAt: null
    });
    if (hasDependents) return res.status(409).json({ message: "Remove dependent todos before deleting this prerequisite." });
    todo.deletedAt = new Date();
    todo.deletedBy = req.user.id;
    await todo.save();
    await TaskHistory.create({
      todoId: todo._id, ownerId: todo.userId, classId: todo.classId,
      actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
      action: "deleted",
      changes: [{ field: "deletedAt", oldValue: null, newValue: todo.deletedAt }]
    });
    await updateDailyProductivity(todo.userId, todo.dueDate.toISOString().slice(0, 10));
    return res.json({ message: "Todo deleted." });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/restore", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Todo ID is not valid." });
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: { $ne: null } });
    if (!todo) return res.status(404).json({ message: "Trashed todo not found." });
    const oldValue = todo.deletedAt;
    todo.deletedAt = null;
    todo.deletedBy = null;
    await todo.save();
    await TaskHistory.create({
      todoId: todo._id, ownerId: todo.userId, classId: todo.classId,
      actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
      action: "restored", changes: [{ field: "deletedAt", oldValue, newValue: null }]
    });
    await updateDailyProductivity(todo.userId, todo.dueDate.toISOString().slice(0, 10));
    return res.json({ todo });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/permanent", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Todo ID is not valid." });
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.user.id, deletedAt: { $ne: null } });
    if (!todo) return res.status(404).json({ message: "Trashed todo not found." });
    await TaskHistory.create({
      todoId: todo._id, ownerId: todo.userId, classId: todo.classId,
      actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
      action: "permanently_deleted",
      changes: [{ field: "title", oldValue: todo.title, newValue: null }]
    });
    await todo.deleteOne();
    return res.json({ message: "Todo permanently deleted." });
  } catch (error) {
    return next(error);
  }
});

export default router;
