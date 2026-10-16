import { Router } from "express";
import { z } from "zod";
import Class from "../models/Class.js";
import Todo from "../models/Todo.js";
import User from "../models/User.js";
import AccessRequest from "../models/AccessRequest.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parsePagination } from "../middleware/pagination.js";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const classSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional().default(""),
  teacherId: objectId.nullable().optional()
}).strict();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const [classes, total] = await Promise.all([
      Class.find().select("_id name description teacherId").populate("teacherId", "email").sort({ name: 1 })
        .skip(pagination.skip).limit(pagination.limit).lean(),
      Class.countDocuments()
    ]);
    return res.json({ classes, pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) } });
  } catch (error) {
    return next(error);
  }
});

router.get("/mine", requireRole("TEACHER_ADMIN"), async (req, res, next) => {
  try {
    const classroom = await Class.findOne({ teacherId: req.user.id }).select("_id name description").lean();
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const studentFilter = { classId: classroom._id, role: "STUDENT" };
    const [students, total] = await Promise.all([
      User.find(studentFilter).select("_id email").sort({ email: 1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      User.countDocuments(studentFilter)
    ]);
    return res.json({
      class: classroom,
      students,
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/mine/students/:studentId/todos", requireRole("TEACHER_ADMIN"), async (req, res, next) => {
  try {
    if (!objectId.safeParse(req.params.studentId).success) {
      return res.status(400).json({ message: "Student ID is not valid." });
    }
    const classroom = await Class.findOne({ teacherId: req.user.id }).select("_id").lean();
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const student = await User.findOne({
      _id: req.params.studentId,
      role: "STUDENT",
      accountType: "class",
      classId: classroom._id
    }).select("_id email").lean();
    if (!student) return res.status(404).json({ message: "Student not found in your class." });

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ message: "Page must be positive and limit must be between 1 and 50." });
    }
    const filter = { userId: student._id, classId: classroom._id };
    const [todos, total] = await Promise.all([
      Todo.find(filter).sort({ dueDate: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Todo.countDocuments(filter)
    ]);
    return res.json({ student, todos, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return next(error);
  }
});

router.get("/students", async (req, res, next) => {
  try {
    if (!req.user.classId || req.user.accountType !== "class") {
      return res.status(403).json({ message: "Join a class to see classmates." });
    }
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const { page, limit } = pagination;
    const studentFilter = {
      classId: req.user.classId,
      role: "STUDENT",
      _id: { $ne: req.user.id }
    };
    const [students, studentTotal] = await Promise.all([
      User.find(studentFilter).select("_id email").sort({ email: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(studentFilter)
    ]);
    const studentIds = students.map((student) => student._id);
    const filter = {
      userId: { $in: studentIds },
      classId: req.user.classId,
      visibility: { $in: ["classmates", "public"] }
    };
    const [todos, total] = await Promise.all([
      Todo.find(filter).populate("userId", "_id email").sort({ dueDate: 1, createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      Todo.countDocuments(filter)
    ]);
    return res.json({
      students,
      todos,
      studentPagination: { page, limit, total: studentTotal, pages: Math.ceil(studentTotal / limit) },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    const parsed = classSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Check the class details and try again." });
    if (parsed.data.teacherId) {
      const teacher = await User.findOne({ _id: parsed.data.teacherId, role: "TEACHER_ADMIN" });
      if (!teacher) return res.status(400).json({ message: "Choose a valid teacher account." });
      if (await Class.exists({ teacherId: teacher._id })) {
        return res.status(409).json({ message: "A teacher can only be assigned to one class." });
      }
    }
    const classroom = await Class.create(parsed.data);
    return res.status(201).json({ class: classroom });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A teacher can only be assigned to one class." });
    return next(error);
  }
});

router.patch("/:id", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    if (!objectId.safeParse(req.params.id).success) return res.status(400).json({ message: "Class ID is not valid." });
    const parsed = classSchema.partial().safeParse(req.body);
    if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
      return res.status(400).json({ message: "Check the class details and try again." });
    }
    if (parsed.data.teacherId) {
      const teacher = await User.findOne({ _id: parsed.data.teacherId, role: "TEACHER_ADMIN" });
      if (!teacher) return res.status(400).json({ message: "Choose a valid teacher account." });
      if (await Class.exists({ teacherId: teacher._id, _id: { $ne: req.params.id } })) {
        return res.status(409).json({ message: "A teacher can only be assigned to one class." });
      }
    }
    const classroom = await Class.findByIdAndUpdate(req.params.id, { $set: parsed.data }, { new: true, runValidators: true });
    if (!classroom) return res.status(404).json({ message: "Class not found." });
    if (parsed.data.teacherId === null) {
      await User.updateMany({ role: "STUDENT", classId: classroom._id }, { $set: { classId: null } });
    }
    return res.json({ class: classroom });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A teacher can only be assigned to one class." });
    return next(error);
  }
});

router.delete("/:id", requireRole("SUPER_ADMIN"), async (req, res, next) => {
  try {
    if (!objectId.safeParse(req.params.id).success) return res.status(400).json({ message: "Class ID is not valid." });
    const classroom = await Class.findByIdAndDelete(req.params.id);
    if (!classroom) return res.status(404).json({ message: "Class not found." });
    await User.updateMany({ classId: classroom._id }, { $set: { classId: null } });
    await Todo.updateMany({ classId: classroom._id }, { $set: { classId: null } });
    await AccessRequest.deleteMany({ classId: classroom._id });
    return res.json({ message: "Class deleted." });
  } catch (error) {
    return next(error);
  }
});

export default router;
