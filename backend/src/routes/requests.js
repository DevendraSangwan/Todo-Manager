import { Router } from "express";
import { z } from "zod";
import AccessRequest from "../models/AccessRequest.js";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parsePagination } from "../middleware/pagination.js";

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const incomingFilter = { recipientId: req.user.id, status: "pending" };
    const answersFilter = {
      $and: [
        { $or: [{ requesterId: req.user.id }, { recipientId: req.user.id }] },
        { $or: [{ status: { $ne: "pending" } }, { requesterId: req.user.id }] }
      ]
    };
    const [incoming, answers] = await Promise.all([
      AccessRequest.find(incomingFilter).populate("requesterId", "_id email").populate("classId", "_id name")
        .sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      AccessRequest.find(answersFilter).populate("requesterId", "_id email").populate("recipientId", "_id email")
        .populate("classId", "_id name").sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean()
    ]);
    const [requestTotal, answerTotal] = await Promise.all([
      AccessRequest.countDocuments(incomingFilter),
      AccessRequest.countDocuments(answersFilter)
    ]);
    return res.json({
      requests: incoming,
      answers,
      pagination: {
        requests: { page: pagination.page, limit: pagination.limit, total: requestTotal, pages: Math.ceil(requestTotal / pagination.limit) },
        answers: { page: pagination.page, limit: pagination.limit, total: answerTotal, pages: Math.ceil(answerTotal / pagination.limit) }
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/friend-access", async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().trim().email().max(254) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter a valid friend's email." });
    const friend = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("_id email");
    if (!friend) return res.status(404).json({ message: "No account was found for that email." });
    if (friend.id === req.user.id) return res.status(400).json({ message: "You cannot request access to your own todos." });
    const existing = await AccessRequest.findOne({
      requesterId: req.user.id,
      recipientId: friend._id,
      kind: "friend_access",
      status: { $in: ["pending", "approved"] }
    });
    if (existing) return res.status(409).json({ message: "A request to this friend is already pending or approved." });
    const request = await AccessRequest.create({
      requesterId: req.user.id,
      recipientId: friend._id,
      kind: "friend_access"
    });
    return res.status(201).json({ request });
  } catch (error) {
    return next(error);
  }
});

router.post("/join-class", async (req, res, next) => {
  try {
    const parsed = z.object({ classId: objectId }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose a valid class." });
    if (req.user.role !== "STUDENT" || req.user.accountType !== "class") {
      return res.status(403).json({ message: "Only students setting up a class account can request to join." });
    }
    const classroom = await Class.findById(parsed.data.classId).select("_id");
    if (!classroom) return res.status(404).json({ message: "Class not found." });
    if (req.user.classId) return res.status(409).json({ message: "You already belong to a class." });
    const existing = await AccessRequest.findOne({
      requesterId: req.user.id,
      kind: "join_class",
      status: "pending"
    });
    if (existing) return res.status(409).json({ message: "A request to join this class is already pending." });
    const request = await AccessRequest.create({
      requesterId: req.user.id,
      classId: classroom._id,
      kind: "join_class"
    });
    return res.status(201).json({ request });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!objectId.safeParse(req.params.id).success) return res.status(400).json({ message: "Request ID is not valid." });
    const parsed = z.object({ decision: z.enum(["approved", "rejected"]) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose approve or reject." });
    const request = await AccessRequest.findById(req.params.id);
    if (!request || request.status !== "pending") return res.status(404).json({ message: "Pending request not found." });

    if (request.kind === "friend_access") {
      if (String(request.recipientId) !== req.user.id) {
        return res.status(403).json({ message: "Only the requested friend can answer this request." });
      }
    } else {
      if (req.user.role !== "TEACHER_ADMIN") {
        return res.status(403).json({ message: "Only a class teacher can answer a join request." });
      }
      const classroom = await Class.findOne({ _id: request.classId, teacherId: req.user.id }).select("_id");
      if (!classroom) return res.status(403).json({ message: "This request is not for your class." });
      if (parsed.data.decision === "approved") {
        const student = await User.findOneAndUpdate({
          _id: request.requesterId,
          role: "STUDENT",
          accountType: "class",
          classId: null
        }, { $set: { classId: classroom._id } }, { new: true }).select("_id");
        if (!student) return res.status(409).json({ message: "This student is not eligible to join a class." });
      }
    }

    request.status = parsed.data.decision;
    await request.save();
    return res.json({ request });
  } catch (error) {
    return next(error);
  }
});

router.get("/class/pending", requireRole("TEACHER_ADMIN"), async (req, res, next) => {
  try {
    const classroom = await Class.findOne({ teacherId: req.user.id }).select("_id");
    if (!classroom) return res.status(404).json({ message: "No class is assigned to this teacher." });
    const pagination = parsePagination(req, res);
    if (!pagination) return;
    const filter = {
      classId: classroom._id,
      kind: "join_class",
      status: "pending"
    };
    const [requests, total] = await Promise.all([
      AccessRequest.find(filter).populate("requesterId", "_id email").sort({ createdAt: 1 })
        .skip(pagination.skip).limit(pagination.limit).lean(),
      AccessRequest.countDocuments(filter)
    ]);
    return res.json({
      requests,
      pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
