import mongoose from "mongoose";

const goalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    targetDate: { type: Date, default: null },
    milestones: [{
      title: { type: String, required: true, trim: true, maxlength: 120 },
      targetDate: { type: Date, default: null },
      completed: { type: Boolean, default: false },
      completedAt: { type: Date, default: null }
    }]
  },
  { timestamps: true }
);

export default mongoose.model("Goal", goalSchema);
