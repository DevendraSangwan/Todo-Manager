import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  dueDate: { type: Date, required: true, index: true },
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }]
}, { timestamps: true });

export default mongoose.model("Assignment", assignmentSchema);
