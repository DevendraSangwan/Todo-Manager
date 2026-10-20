import mongoose from "mongoose";

const habitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    completedDates: { type: [String], default: [] }
  },
  { timestamps: true }
);

export default mongoose.model("Habit", habitSchema);
