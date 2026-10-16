import { Router } from "express";
import { z } from "zod";
import AccessRequest from "../models/AccessRequest.js";
import Class from "../models/Class.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePagination } from "../middleware/pagination.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const filter = { recipientId: req.user.id };
    const [notifications, total] = await Promise.all([
      Notification.find(filter).populate("senderId", "_id email").sort({ createdAt: -1 })
        .skip(pagination.skip).limit(pagination.limit).lean(),
      Notification.countDocuments(filter)
    ]);
    return res.json({
      notifications,
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/messages", async (req, res, next) => {
  try {
    const parsed = z.object({
      email: z.string().trim().email().max(254),
      message: z.string().trim().min(1).max(500)
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid recipient email and message." });

    const recipient = await User.findOne({ email: parsed.data.email.toLowerCase() })
      .select("_id email classId accountType");
    if (!recipient) return res.status(404).json({ message: "No account was found for that email." });
    if (String(recipient._id) === req.user.id) return res.status(400).json({ message: "You cannot message yourself." });

    let mayMessage = Boolean(req.user.classId && recipient.classId && String(req.user.classId) === String(recipient.classId));
    if (!mayMessage) {
      mayMessage = Boolean(await AccessRequest.exists({
        kind: "friend_access",
        status: "approved",
        $or: [
          { requesterId: req.user.id, recipientId: recipient._id },
          { requesterId: recipient._id, recipientId: req.user.id }
        ]
      }));
    }
    if (!mayMessage) return res.status(403).json({ message: "Messages are limited to classmates and approved friends." });

    const notification = await Notification.create({
      senderId: req.user.id,
      recipientId: recipient._id,
      message: parsed.data.message
    });
    return res.status(201).json({ notification });
  } catch (error) {
    return next(error);
  }
});

export default router;
