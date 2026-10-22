import mongoose from "mongoose";

const assignmentSubmissionSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  submittedAt: { type: Date, default: null },
  response: { type: String, trim: true, maxlength: 2000, default: "" }
}, { timestamps: true });

assignmentSubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

export default mongoose.model("AssignmentSubmission", assignmentSubmissionSchema);
