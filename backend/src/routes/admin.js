import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import Class from "../models/Class.js";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parsePagination } from "../middleware/pagination.js";

const router = Router();
const teacherSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
}).strict();

router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.get("/teachers", async (req, res, next) => {
  try {
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const teacherFilter = { role: "TEACHER_ADMIN" };
    const [teachers, total, classes] = await Promise.all([
      User.find(teacherFilter).select("_id email").sort({ email: 1 })
        .skip(pagination.skip).limit(pagination.limit).lean(),
      User.countDocuments(teacherFilter),
      Class.find({ teacherId: { $ne: null } }).select("_id name teacherId").lean()
    ]);
    const classByTeacherId = new Map(classes.map((classroom) => [String(classroom.teacherId), classroom]));
    return res.json({
      teachers: teachers.map((teacher) => ({
        ...teacher,
        class: classByTeacherId.get(String(teacher._id)) ?? null
      })),
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/teachers", async (req, res, next) => {
  try {
    const parsed = teacherSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid email and password of at least 8 characters." });
    const password = await bcrypt.hash(parsed.data.password, 12);
    const teacher = await User.create({
      email: parsed.data.email,
      password,
      role: "TEACHER_ADMIN",
      accountType: "personal",
      setupComplete: true
    });
    return res.status(201).json({ teacher: { id: teacher.id, email: teacher.email, role: teacher.role } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    return next(error);
  }
});

router.patch("/teachers/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Teacher ID is not valid." });
    const parsed = z.object({
      email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
      password: z.string().min(8).max(128).optional()
    }).strict().safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
      return res.status(400).json({ message: "Enter a valid email or a password of at least 8 characters." });
    }
    const update = { ...parsed.data };
    if (update.password) update.password = await bcrypt.hash(update.password, 12);
    const teacher = await User.findOneAndUpdate(
      { _id: req.params.id, role: "TEACHER_ADMIN" },
      { $set: update },
      { new: true, runValidators: true }
    ).select("_id email role");
    if (!teacher) return res.status(404).json({ message: "Teacher not found." });
    return res.json({ teacher: { id: teacher.id, email: teacher.email, role: teacher.role } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    return next(error);
  }
});

router.delete("/teachers/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Teacher ID is not valid." });
    const teacher = await User.findOneAndDelete({ _id: req.params.id, role: "TEACHER_ADMIN" });
    if (!teacher) return res.status(404).json({ message: "Teacher not found." });
    await Class.updateOne({ teacherId: teacher._id }, { $set: { teacherId: null } });
    return res.json({ message: "Teacher deleted." });
  } catch (error) {
    return next(error);
  }
});

export default router;
