import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 3000 }
}, { timestamps: true });

export default mongoose.model("Announcement", announcementSchema);
