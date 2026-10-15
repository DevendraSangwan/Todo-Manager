import { Router } from "express";
import { z } from "zod";
import Todo from "../models/Todo.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().datetime({ offset: true })
});
const updateTodoSchema = z.object({
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

    const filter = { userId: req.user.id };
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

    const [todos, total] = await Promise.all([
      Todo.find(filter)
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

router.post("/", async (req, res, next) => {
  try {
    const parsed = createTodoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Check the todo fields and try again." });
    }
    const todo = await Todo.create({ ...parsed.data, dueDate: new Date(parsed.data.dueDate), userId: req.user.id });
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

    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: parsed.data },
      { new: true, runValidators: true }
    );
    if (!todo) {
      return res.status(404).json({ message: "Todo not found." });
    }
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
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!todo) {
      return res.status(404).json({ message: "Todo not found." });
    }
    return res.json({ message: "Todo deleted." });
  } catch (error) {
    return next(error);
  }
});

export default router;
