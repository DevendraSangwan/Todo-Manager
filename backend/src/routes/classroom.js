import { Router } from "express";
import { z } from "zod";
import Announcement from "../models/Announcement.js";
import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Class from "../models/Class.js";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const assignmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  dueDate: z.string().datetime({ offset: true }),
  studentIds: z.array(objectId).max(500).optional()
}).strict();
const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(3000)
}).strict();

router.use(requireAuth);

async function teacherClass(userId) {
  return Class.findOne({ teacherId: userId }).select("_id name").lean();
}

function isStudent(user) {
  return user.role === "STUDENT" && user.accountType === "class" && Boolean(user.classId);
}

router.get("/assignments", async (req, res, next) => {
  try {
    if (req.user.role === "TEACHER_ADMIN") {
      const classroom = await teacherClass(req.user.id);
      if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
      const assignments = await Assignment.find({ classId: classroom._id }).sort({ dueDate: 1 }).lean();
      const submissions = await AssignmentSubmission.find({ classId: classroom._id })
        .populate("studentId", "_id email").sort({ createdAt: 1 }).lean();
      const submissionsByAssignment = new Map();
      for (const submission of submissions) {
        const items = submissionsByAssignment.get(String(submission.assignmentId)) ?? [];
        items.push({
          student: submission.studentId,
          submittedAt: submission.submittedAt,
          response: submission.response,
          late: Boolean(submission.submittedAt && submission.submittedAt > assignments.find((a) => String(a._id) === String(submission.assignmentId))?.dueDate)
        });
        submissionsByAssignment.set(String(submission.assignmentId), items);
      }
      return res.json({
        assignments: assignments.map((assignment) => ({
          ...assignment,
          submissions: submissionsByAssignment.get(String(assignment._id)) ?? []
        }))
      });
    }
    if (!isStudent(req.user)) return res.status(403).json({ message: "Class assignments are available to class members." });
    const submissions = await AssignmentSubmission.find({ studentId: req.user.id, classId: req.user.classId })
      .populate("assignmentId", "title description dueDate teacherId").sort({ createdAt: -1 }).lean();
    return res.json({
      assignments: submissions.filter((item) => item.assignmentId).map((item) => ({
        ...item.assignmentId,
        submission: { submittedAt: item.submittedAt, response: item.response },
        late: Boolean(item.submittedAt && item.submittedAt > item.assignmentId.dueDate),
        overdue: !item.submittedAt && item.assignmentId.dueDate < new Date()
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/assignments", requireRole("TEACHER_ADMIN"), async (req, res, next) => {
  try {
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Check the assignment details and try again." });
    const classroom = await teacherClass(req.user.id);
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const studentFilter = { classId: classroom._id, role: "STUDENT", accountType: "class" };
    if (parsed.data.studentIds) studentFilter._id = { $in: parsed.data.studentIds };
    const students = await User.find(studentFilter).select("_id").lean();
    if (parsed.data.studentIds && students.length !== new Set(parsed.data.studentIds).size) {
      return res.status(400).json({ message: "Choose only students who belong to your class." });
    }
    if (!students.length) return res.status(400).json({ message: "The assignment must include at least one student." });

    const assignment = await Assignment.create({
      classId: classroom._id,
      teacherId: req.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: new Date(parsed.data.dueDate),
      studentIds: students.map(({ _id }) => _id)
    });
    await AssignmentSubmission.insertMany(students.map(({ _id }) => ({
      assignmentId: assignment._id,
      classId: classroom._id,
      studentId: _id
    })));
    return res.status(201).json({ assignment });
  } catch (error) {
    return next(error);
  }
});

router.post("/assignments/:assignmentId/submit", async (req, res, next) => {
  try {
    if (!objectId.safeParse(req.params.assignmentId).success) return res.status(400).json({ message: "Assignment ID is not valid." });
    if (!isStudent(req.user)) return res.status(403).json({ message: "Only class students can submit an assignment." });
    const parsed = z.object({ response: z.string().trim().max(2000).optional().default("") }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Submission text must be 2000 characters or fewer." });
    const submission = await AssignmentSubmission.findOne({
      assignmentId: req.params.assignmentId,
      studentId: req.user.id,
      classId: req.user.classId
    });
    if (!submission) return res.status(404).json({ message: "Assignment not found for your class." });
    if (!submission.submittedAt) submission.submittedAt = new Date();
    submission.response = parsed.data.response;
    await submission.save();
    const assignment = await Assignment.findById(submission.assignmentId).select("dueDate").lean();
    return res.json({
      submission: {
        submittedAt: submission.submittedAt,
        response: submission.response,
        late: submission.submittedAt > assignment.dueDate
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/analytics", requireRole("TEACHER_ADMIN"), async (req, res, next) => {
  try {
    const classroom = await teacherClass(req.user.id);
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const [assignments, submissions] = await Promise.all([
      Assignment.find({ classId: classroom._id }).select("_id dueDate").lean(),
      AssignmentSubmission.find({ classId: classroom._id }).select("assignmentId submittedAt").lean()
    ]);
    const assignmentById = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));
    const now = new Date();
    const submitted = submissions.filter((item) => item.submittedAt);
    const overdue = submissions.filter((item) => {
      const assignment = assignmentById.get(String(item.assignmentId));
      return assignment && !item.submittedAt && assignment.dueDate < now;
    }).length;
    const total = submissions.length;
    const weeklyTrend = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      const nextDate = new Date(date);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      return {
        date: date.toISOString().slice(0, 10),
        submitted: submitted.filter((item) => item.submittedAt >= date && item.submittedAt < nextDate).length
      };
    });
    return res.json({
      className: classroom.name,
      totalAssignments: assignments.length,
      totalSubmissions: total,
      submitted: submitted.length,
      completionPercentage: total ? Math.round(submitted.length / total * 100) : 0,
      overdue,
      weeklyTrend
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/announcements", async (req, res, next) => {
  try {
    const classroom = req.user.role === "TEACHER_ADMIN"
      ? await teacherClass(req.user.id)
      : isStudent(req.user)
        ? { _id: req.user.classId }
        : null;
    if (!classroom) return res.status(403).json({ message: "Announcements are available to class members and their teacher." });
    const announcements = await Announcement.find({ classId: classroom._id })
      .populate("teacherId", "_id email").sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ announcements });
  } catch (error) {
    return next(error);
  }
});

router.post("/announcements", requireRole("TEACHER_ADMIN"), async (req, res, next) => {
  try {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Check the announcement details and try again." });
    const classroom = await teacherClass(req.user.id);
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const announcement = await Announcement.create({
      ...parsed.data,
      classId: classroom._id,
      teacherId: req.user.id
    });
    return res.status(201).json({ announcement });
  } catch (error) {
    return next(error);
  }
});

export default router;
