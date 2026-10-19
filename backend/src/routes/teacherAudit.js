import { Router } from "express";
import TaskHistory from "../models/TaskHistory.js";
import Class from "../models/Class.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parsePagination } from "../middleware/pagination.js";

const router = Router();

router.use(requireAuth, requireRole("TEACHER_ADMIN"));

router.get("/mine", async (req, res, next) => {
  try {
    const classroom = await Class.findOne({ teacherId: req.user.id }).select("_id").lean();
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const filter = { classId: classroom._id, actorId: req.user.id, actorRole: "TEACHER_ADMIN" };
    const [entries, total] = await Promise.all([
      TaskHistory.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      TaskHistory.countDocuments(filter)
    ]);
    return res.json({
      entries,
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
