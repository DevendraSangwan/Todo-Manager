import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER_ADMIN", "SUPER_ADMIN"],
      default: "STUDENT",
      required: true
    },
    accountType: {
      type: String,
      enum: ["personal", "class"],
      default: "personal"
    },
    setupComplete: { type: Boolean, default: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
