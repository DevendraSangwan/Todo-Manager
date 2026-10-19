import { Router } from "express";
import { z } from "zod";
import AccessRequest from "../models/AccessRequest.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/:friendId/todos", async (req, res, next) => {
  try {
    if (!z.string().regex(/^[a-f\d]{24}$/i).safeParse(req.params.friendId).success) {
      return res.status(400).json({ message: "Friend ID is not valid." });
    }
    const allowed = await AccessRequest.exists({
      requesterId: req.user.id,
      recipientId: req.params.friendId,
      kind: "friend_access",
      status: "approved"
    });
    if (!allowed) return res.status(403).json({ message: "Friend todo access has not been approved." });

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Page must be positive and limit must be between 1 and 50." });
    }
    const friend = await User.findById(req.params.friendId).select("_id email").lean();
    if (!friend) return res.status(404).json({ message: "Friend not found." });
    const filter = {
      userId: friend._id,
      visibility: { $in: ["classmates", "public"] },
      deletedAt: null
    };
    const [todos, total] = await Promise.all([
      Todo.find(filter).sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Todo.countDocuments(filter)
    ]);
    return res.json({ friend, todos, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return next(error);
  }
});

export default router;
