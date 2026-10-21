import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import AIAction from "../models/AIAction.js";
import Goal from "../models/Goal.js";
import TaskHistory from "../models/TaskHistory.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { generateJson } from "../services/gemini.js";
import { updateDailyProductivity } from "../utils/productivity.js";

const router = Router();
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const dateTimeSchema = z.string().datetime({ offset: true });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const prioritySchema = z.enum(["urgent-important", "important-not-urgent", "urgent-not-important", "neither"]);
const activeTodoFilter = (userId) => ({ userId, deletedAt: null });
const taskContextFields = "_id title description priority dueDate estimatedMinutes actualMinutes status subtasks createdAt updatedAt";
const aiGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "You've reached the AI request limit. Please try again in 15 minutes." }
});
router.use(requireAuth);

async function runAI(res, next, callback) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ message: "AI features are unavailable until the server is configured with a Gemini API key." });
    }
    return await callback();
  } catch (error) {
    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

function jsonSchema(schema, message) {
  return (value) => {
    const result = schema.safeParse(value);
    if (!result.success) throw Object.assign(new Error(message), { status: 502 });
    return result.data;
  };
}

const suggestionSchema = z.object({
  analysis: z.string().trim().min(1).max(1200),
  suggestions: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    dueDate: dateTimeSchema,
    priority: prioritySchema,
    estimatedMinutes: z.number().int().min(0).max(100000).default(0)
  }).strict()).max(5)
}).strict();

const stepsSchema = z.object({
  steps: z.array(z.string().trim().min(1).max(120)).min(4).max(5)
}).strict();

const chatSchema = z.object({
  answer: z.string().trim().min(1).max(2500),
  clarificationNeeded: z.boolean(),
  clarifyingQuestion: z.string().trim().max(500).default("")
}).strict();

const rescheduleSchema = z.object({
  suggestions: z.array(z.object({
    strategy: z.enum(["split", "shift", "priority"]),
    explanation: z.string().trim().min(1).max(400),
    dueDate: dateTimeSchema.optional(),
    priority: prioritySchema.optional()
  }).strict().superRefine((suggestion, context) => {
    if (suggestion.strategy === "shift" && !suggestion.dueDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Shift suggestions require a due date." });
    }
    if (suggestion.strategy === "priority" && !suggestion.priority) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Priority suggestions require a priority." });
    }
  })).min(1).max(3)
}).strict();

const goalPlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  targetDate: dateSchema,
  milestones: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    targetDate: dateSchema
  }).strict()).min(2).max(12),
  dailyTasks: z.array(z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    dueDate: dateTimeSchema,
    priority: prioritySchema,
    estimatedMinutes: z.number().int().min(0).max(100000).default(0)
  }).strict()).min(1).max(30)
}).strict();

const voiceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  dueDate: dateSchema,
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  priority: prioritySchema,
  estimatedMinutes: z.number().int().min(0).max(100000).default(0)
}).strict();

const actionSchema = z.union([
  z.object({
    type: z.literal("add_todo"),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(""),
    dueDate: dateTimeSchema,
    priority: prioritySchema,
    estimatedMinutes: z.number().int().min(0).max(100000).default(0)
  }).strict(),
  z.object({
    type: z.literal("move_todo"),
    todoId: objectIdSchema,
    dueDate: dateTimeSchema.optional(),
    priority: prioritySchema.optional()
  }).strict().refine((value) => value.dueDate !== undefined || value.priority !== undefined)
]);

function buildUserPrompt(instruction, data) {
  return `${instruction}\n\nAuthorized user data (JSON):\n${JSON.stringify(data)}`;
}

router.get("/settings", (req, res) => {
  return res.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    alwaysAllowActions: req.user.aiAlwaysAllowActions ?? [],
    allowedActions: ["add_todo", "move_todo"]
  });
});

router.patch("/settings", async (req, res, next) => {
  const parsed = z.object({
    alwaysAllowActions: z.array(z.enum(["add_todo", "move_todo"])).max(2)
  }).strict().safeParse(req.body);
  if (!parsed.success || new Set(parsed.data?.alwaysAllowActions ?? []).size !== parsed.data?.alwaysAllowActions?.length) {
    return res.status(400).json({ message: "Choose valid, unique AI actions to allow automatically." });
  }
  try {
    const user = await User.findByIdAndUpdate(req.user.id, {
      $set: { aiAlwaysAllowActions: parsed.data.alwaysAllowActions }
    }, { new: true }).select("aiAlwaysAllowActions").lean();
    return res.json({ alwaysAllowActions: user.aiAlwaysAllowActions });
  } catch (error) {
    return next(error);
  }
});

router.post("/suggestions", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 45);
  const [pending, completed, profile] = await Promise.all([
    Todo.find({ ...activeTodoFilter(req.user.id), status: "pending" }).select(taskContextFields).sort({ dueDate: 1 }).limit(50).lean(),
    Todo.find({ ...activeTodoFilter(req.user.id), status: "completed", updatedAt: { $gte: since } }).select(taskContextFields).sort({ updatedAt: -1 }).limit(30).lean(),
    User.findById(req.user.id).select("chronotype dailyGoalHours interests").lean()
  ]);
  const output = jsonSchema(suggestionSchema, "AI suggestions did not match the expected format.")(
    await generateJson({
      system: "You are a task-planning assistant. Use only the supplied user's own tasks and preferences. Analyze pending work before suggesting up to five useful tasks for today. Never claim a task was added. Return JSON with analysis and suggestions. Use ISO timestamps with timezone offsets; if no time is known, use 17:00 UTC today.",
      prompt: buildUserPrompt("Suggest a realistic plan for today. Avoid duplicating pending tasks. Give short, actionable titles.", {
        today: new Date().toISOString(),
        profile,
        pending,
        recentlyCompleted: completed
      })
    })
  );
  return res.json(output);
}));

router.post("/break-into-steps/:todoId", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  if (!objectIdSchema.safeParse(req.params.todoId).success) return res.status(400).json({ message: "Todo ID is not valid." });
  const todo = await Todo.findOne({ _id: req.params.todoId, ...activeTodoFilter(req.user.id) }).select(taskContextFields).lean();
  if (!todo) return res.status(404).json({ message: "Todo not found." });
  const output = jsonSchema(stepsSchema, "AI steps did not match the expected format.")(
    await generateJson({
      system: "Break the given task into four or five concise, sequential checklist items. Use only the task details provided. Return JSON with a steps array. Do not modify or save anything.",
      prompt: JSON.stringify({ task: todo })
    })
  );
  return res.json(output);
}));

router.post("/chat", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  const parsed = z.object({ message: z.string().trim().min(1).max(500) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a task question of 500 characters or fewer." });
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);
  const todos = await Todo.find({
    ...activeTodoFilter(req.user.id),
    $or: [{ status: "pending" }, { status: "completed", updatedAt: { $gte: since } }]
  }).select(taskContextFields).sort({ dueDate: 1 }).limit(100).lean();
  const output = jsonSchema(chatSchema, "The AI could not answer in the expected format.")(
    await generateJson({
      system: "Answer questions only from the supplied authorized user's todo records. Do not infer missing facts, use outside data, or reveal anything about other users. If the request can mean multiple things, set clarificationNeeded true and ask one specific clarifyingQuestion. Otherwise answer clearly and concisely. Return JSON with answer, clarificationNeeded, and clarifyingQuestion.",
      prompt: buildUserPrompt(parsed.data.message, { today: new Date().toISOString(), todos })
    })
  );
  return res.json(output);
}));

router.post("/reschedule/:todoId", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  if (!objectIdSchema.safeParse(req.params.todoId).success) return res.status(400).json({ message: "Todo ID is not valid." });
  const todo = await Todo.findOne({ _id: req.params.todoId, ...activeTodoFilter(req.user.id) }).select(taskContextFields).lean();
  if (!todo) return res.status(404).json({ message: "Todo not found." });
  const history = await TaskHistory.find({
    todoId: todo._id,
    ownerId: req.user.id,
    "changes.field": "dueDate"
  }).select("changes createdAt").sort({ createdAt: -1 }).lean();
  const postponements = history.flatMap((entry) => entry.changes)
    .filter((change) => change.field === "dueDate" && change.oldValue && change.newValue &&
      new Date(change.newValue) > new Date(change.oldValue)).length;
  if (postponements < 3) {
    return res.status(409).json({ message: "Smart rescheduling is available after this todo has been postponed three times." });
  }
  const output = jsonSchema(rescheduleSchema, "AI rescheduling suggestions did not match the expected format.")(
    await generateJson({
      system: "Suggest one to three practical options for the supplied task, using only the supplied details. Include a split strategy when useful, a future shift strategy, or priority adjustment. Never change the task. For shift/priority suggestions include the exact proposed field values. Return JSON with suggestions.",
      prompt: JSON.stringify({ today: new Date().toISOString(), task: todo, postponementHistory: history })
    })
  );
  return res.json({ postponements, ...output });
}));

router.post("/goal-plan", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  const parsed = z.object({
    goal: z.string().trim().min(3).max(500),
    targetDate: dateSchema.optional()
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Enter a goal (3–500 characters) and an optional valid target date." });
  const output = jsonSchema(goalPlanSchema, "The AI goal plan did not match the expected format.")(
    await generateJson({
      system: "Turn the user's goal into a practical plan. Return 2–12 weekly milestones and 1–30 actionable daily tasks with ISO due timestamps. Respect the target date if supplied and use only the provided goal/preferences. Do not save anything.",
      prompt: JSON.stringify({ today: new Date().toISOString(), ...parsed.data })
    })
  );
  return res.json(output);
}));

router.post("/goal-plan/apply", async (req, res, next) => {
  const parsed = goalPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Review a valid AI goal plan before saving it." });
  let goal;
  let todos = [];
  try {
    const classId = req.user.role === "STUDENT" && req.user.accountType === "class" ? req.user.classId : null;
    goal = await Goal.create({
      userId: req.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      targetDate: new Date(`${parsed.data.targetDate}T12:00:00.000Z`),
      milestones: parsed.data.milestones.map(({ title, targetDate }) => ({
        title,
        targetDate: new Date(`${targetDate}T12:00:00.000Z`)
      }))
    });
    todos = await Todo.insertMany(parsed.data.dailyTasks.map((task) => ({
      ...task,
      dueDate: new Date(task.dueDate),
      userId: req.user.id,
      classId,
      visibility: "private"
    })));
    await TaskHistory.insertMany(todos.map((todo) => ({
      todoId: todo._id,
      ownerId: req.user.id,
      classId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "created",
      changes: [{ field: "title", oldValue: null, newValue: todo.title }]
    })));
    await Promise.all(todos.map((todo) => updateDailyProductivity(req.user._id, todo.dueDate.toISOString().slice(0, 10))));
    return res.status(201).json({ goal, todos });
  } catch (error) {
    if (goal) {
      try {
        await Promise.all([
          Goal.deleteOne({ _id: goal._id, userId: req.user.id }),
          Todo.deleteMany({ _id: { $in: todos.map((todo) => todo._id) }, userId: req.user.id }),
          TaskHistory.deleteMany({ todoId: { $in: todos.map((todo) => todo._id) }, ownerId: req.user.id })
        ]);
      } catch (rollbackError) {
        return next(new AggregateError([error, rollbackError], "Saving the goal plan failed and its rollback was incomplete."));
      }
    }
    return next(error);
  }
});

router.post("/parse-voice", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  const parsed = z.object({
    transcript: z.string().trim().min(1).max(500),
    timeZone: z.string().trim().min(1).max(80)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a voice transcript and valid time zone." });
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timeZone });
  } catch {
    return res.status(400).json({ message: "Time zone must be a valid IANA time zone." });
  }
  const output = jsonSchema(voiceSchema, "Voice parsing did not return a valid todo draft.")(
    await generateJson({
      system: "Parse the transcript into a todo draft. Resolve relative dates from the supplied current time in the supplied IANA timezone. Use 17:00 when no time is specified, preserve the meaning of the transcript, and return JSON fields title, dueDate (YYYY-MM-DD local), dueTime (HH:mm local), priority (one of the supported values), estimatedMinutes (0 if unknown). Do not create the task.",
      prompt: JSON.stringify({ now: new Date().toISOString(), ...parsed.data })
    })
  );
  return res.json(output);
}));

router.get("/weekly-report", aiGenerationLimiter, async (req, res, next) => runAI(res, next, async () => {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const [todos, completionHistory] = await Promise.all([Todo.find({
    ...activeTodoFilter(req.user.id),
    $or: [{ createdAt: { $gte: start, $lt: end } }, { dueDate: { $gte: start, $lt: end } }]
  }).select("estimatedMinutes actualMinutes status createdAt updatedAt").limit(200).lean(), TaskHistory.find({
    ownerId: req.user.id,
    action: "updated",
    createdAt: { $gte: start, $lt: end },
    changes: { $elemMatch: { field: "status", newValue: "completed" } }
  }).select("changes createdAt").lean()]);
  const completedDays = completionHistory.flatMap((entry) =>
    entry.changes.some((change) => change.field === "status" && change.newValue === "completed")
      ? [new Date(entry.createdAt).toISOString().slice(0, 10)]
      : []);
  const activeDays = new Set(completedDays).size;
  if (completedDays.length < 2 || activeDays < 2) {
    return res.json({
      insufficientData: true,
      report: "There isn't enough completed-task data from at least two different days this week to write a useful productivity report yet."
    });
  }
  const summary = {
    period: { start: start.toISOString(), end: end.toISOString() },
    tasks: todos.length,
    completed: completedDays.length,
    pending: todos.filter((todo) => todo.status === "pending").length,
    estimatedMinutes: todos.reduce((total, todo) => total + (todo.estimatedMinutes || 0), 0),
    actualMinutes: todos.reduce((total, todo) => total + (todo.actualMinutes || 0), 0),
    byDay: Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setUTCDate(day.getUTCDate() + index);
      const date = day.toISOString().slice(0, 10);
      return [date, completedDays.filter((completedDate) => completedDate === date).length];
    }))
  };
  const output = jsonSchema(z.object({ report: z.string().trim().min(1).max(3000) }).strict(),
    "The weekly report did not match the expected format.")(
    await generateJson({
      system: "Write a balanced weekly productivity report using only the supplied aggregate from this authorized user. Mention clear patterns, avoid unsupported judgment, and include one practical next step. Return JSON with a report string.",
      prompt: JSON.stringify(summary)
    })
  );
  return res.json({ insufficientData: false, summary, ...output });
}));

router.post("/actions/preview", async (req, res, next) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide a valid add or move action proposal." });
  try {
    const action = parsed.data;
    let todo = null;
    let payload;
    let previousValues = {};
    if (action.type === "add_todo") {
      payload = {
        title: action.title,
        description: action.description,
        dueDate: new Date(action.dueDate),
        priority: action.priority,
        estimatedMinutes: action.estimatedMinutes
      };
    } else {
      todo = await Todo.findOne({ _id: action.todoId, ...activeTodoFilter(req.user.id) });
      if (!todo) return res.status(404).json({ message: "Todo not found." });
      payload = {
        ...(action.dueDate ? { dueDate: new Date(action.dueDate) } : {}),
        ...(action.priority ? { priority: action.priority } : {})
      };
      previousValues = Object.fromEntries(Object.keys(payload).map((field) => [field, todo[field]]));
    }
    const actionRecord = await AIAction.create({
      userId: req.user.id,
      actionType: action.type,
      payload,
      todoId: todo?._id ?? null,
      previousValues
    });
    if ((req.user.aiAlwaysAllowActions ?? []).includes(action.type)) {
      const applied = await applyAction(actionRecord, req.user);
      return res.status(201).json({ action: applied, automaticallyApplied: true });
    }
    return res.status(201).json({ action: actionRecord, automaticallyApplied: false });
  } catch (error) {
    return next(error);
  }
});

async function applyAction(action, user) {
  const lockedAction = await AIAction.findOneAndUpdate(
    { _id: action._id, userId: user.id, status: "pending" },
    { $set: { status: "applying" } },
    { new: true }
  );
  if (!lockedAction) {
    const error = new Error("This AI action is no longer awaiting approval.");
    error.status = 409;
    throw error;
  }
  action.status = "applying";
  const payload = action.toObject().payload;
  let createdTodo = null;
  let movedTodoId = null;
  let historyEntry = null;
  let previousValues = {};
  try {
    if (action.actionType === "add_todo") {
      const classId = user.role === "STUDENT" && user.accountType === "class" ? user.classId : null;
      createdTodo = await Todo.create({
        ...payload,
        userId: user.id,
        classId,
        visibility: "private"
      });
      action.todoId = createdTodo._id;
      historyEntry = await TaskHistory.create({
        todoId: createdTodo._id, ownerId: user.id, classId,
        actorId: user.id, actorEmail: user.email, actorRole: user.role,
        action: "created",
        changes: [{ field: "title", oldValue: null, newValue: createdTodo.title }]
      });
      await updateDailyProductivity(user._id, createdTodo.dueDate.toISOString().slice(0, 10));
    } else {
      const todo = await Todo.findOne({ _id: action.todoId, ...activeTodoFilter(user.id) });
      if (!todo) {
        const error = new Error("The todo for this AI action no longer exists.");
        error.status = 404;
        throw error;
      }
      previousValues = action.toObject().previousValues;
      if (Object.keys(payload).some((field) => {
        const current = todo[field];
        const previous = previousValues[field];
        return field === "dueDate"
          ? new Date(current).getTime() !== new Date(previous).getTime()
          : current !== previous;
      })) {
        const error = new Error("This todo changed after the proposal was created. Review a new proposal.");
        error.status = 409;
        throw error;
      }
      movedTodoId = todo._id;
      const changes = Object.entries(payload).map(([field, value]) => ({
        field,
        oldValue: todo[field],
        newValue: value
      }));
      todo.set(payload);
      await todo.save();
      historyEntry = await TaskHistory.create({
        todoId: todo._id, ownerId: user.id, classId: todo.classId,
        actorId: user.id, actorEmail: user.email, actorRole: user.role,
        action: "updated", changes
      });
      if (payload.dueDate) {
        await Promise.all([
          updateDailyProductivity(user._id, previousValues.dueDate.toISOString().slice(0, 10)),
          updateDailyProductivity(user._id, payload.dueDate.toISOString().slice(0, 10))
        ]);
      }
    }
    action.status = "applied";
    action.appliedAt = new Date();
    await action.save();
    return action;
  } catch (error) {
    try {
      if (createdTodo) {
        const dependentTodo = await Todo.exists({
          ...activeTodoFilter(user.id),
          dependencies: createdTodo._id
        });
        if (dependentTodo) throw new Error("A dependent todo now references the proposed todo.");
        if (historyEntry) await TaskHistory.deleteOne({ _id: historyEntry._id, ownerId: user.id });
        await Todo.deleteOne({ _id: createdTodo._id, userId: user.id });
        await updateDailyProductivity(user._id, createdTodo.dueDate.toISOString().slice(0, 10));
      }
      if (movedTodoId) {
        const todo = await Todo.findOne({ _id: movedTodoId, ...activeTodoFilter(user.id) });
        if (!todo || Object.keys(payload).some((field) => {
          const current = todo[field];
          const proposed = payload[field];
          return field === "dueDate"
            ? new Date(current).getTime() !== new Date(proposed).getTime()
            : current !== proposed;
        })) {
          throw new Error("The todo changed during rollback; it was left untouched.");
        }
        todo.set(previousValues);
        await todo.save();
        if (historyEntry) await TaskHistory.deleteOne({ _id: historyEntry._id, ownerId: user.id });
        if (previousValues.dueDate) {
          await Promise.all([
            updateDailyProductivity(user._id, payload.dueDate.toISOString().slice(0, 10)),
            updateDailyProductivity(user._id, previousValues.dueDate.toISOString().slice(0, 10))
          ]);
        }
      }
      await AIAction.updateOne(
        { _id: action._id, userId: user.id },
        { $set: { status: "pending", todoId: action.actionType === "add_todo" ? null : action.todoId, appliedAt: null } }
      );
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "The AI action failed and could not be fully rolled back.");
    }
    throw error;
  }
}

router.post("/actions/:id/approve", async (req, res, next) => {
  if (!objectIdSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "AI action ID is not valid." });
  try {
    const action = await AIAction.findOne({ _id: req.params.id, userId: req.user.id });
    if (!action) return res.status(404).json({ message: "AI action not found." });
    return res.json({ action: await applyAction(action, req.user) });
  } catch (error) {
    if (Number.isInteger(error.status)) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

router.post("/actions/:id/undo", async (req, res, next) => {
  if (!objectIdSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "AI action ID is not valid." });
  try {
    const action = await AIAction.findOne({ _id: req.params.id, userId: req.user.id });
    if (!action || action.status !== "applied") return res.status(404).json({ message: "Applied AI action not found." });
    if (action.actionType === "add_todo") {
      const todo = await Todo.findOne({ _id: action.todoId, ...activeTodoFilter(req.user.id) });
      if (todo) {
        const dependentTodo = await Todo.exists({
          ...activeTodoFilter(req.user.id),
          dependencies: todo._id
        });
        if (todo.status !== "pending" || dependentTodo || todo.updatedAt > action.appliedAt) {
          return res.status(409).json({ message: "This todo has changed or is now a prerequisite. It cannot be safely undone." });
        }
        todo.deletedAt = new Date();
        todo.deletedBy = req.user.id;
        await todo.save();
        await updateDailyProductivity(req.user._id, todo.dueDate.toISOString().slice(0, 10));
        await TaskHistory.create({
          todoId: todo._id, ownerId: req.user.id, classId: todo.classId,
          actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
          action: "deleted", changes: [{ field: "deletedAt", oldValue: null, newValue: todo.deletedAt }]
        });
      }
    } else {
      const todo = await Todo.findOne({ _id: action.todoId, ...activeTodoFilter(req.user.id) });
      if (!todo) return res.status(404).json({ message: "Todo not found; the action cannot be undone." });
      const previousValues = action.toObject().previousValues;
      if (Object.keys(action.toObject().payload).some((field) => {
        const current = todo[field];
        const applied = action.toObject().payload[field];
        return field === "dueDate"
          ? new Date(current).getTime() !== new Date(applied).getTime()
          : current !== applied;
      })) {
        return res.status(409).json({ message: "This todo changed after the AI action. Undo it manually to avoid overwriting your newer edits." });
      }
      const changes = Object.entries(previousValues)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([field, value]) => ({ field, oldValue: todo[field], newValue: value }));
      todo.set(previousValues);
      await todo.save();
      await TaskHistory.create({
        todoId: todo._id, ownerId: req.user.id, classId: todo.classId,
        actorId: req.user.id, actorEmail: req.user.email, actorRole: req.user.role,
        action: "updated", changes
      });
      if (previousValues.dueDate) {
        await Promise.all([
          updateDailyProductivity(req.user._id, action.payload.dueDate.toISOString().slice(0, 10)),
          updateDailyProductivity(req.user._id, previousValues.dueDate.toISOString().slice(0, 10))
        ]);
      }
    }
    action.status = "undone";
    action.undoneAt = new Date();
    await action.save();
    return res.json({ action });
  } catch (error) {
    return next(error);
  }
});

export default router;
