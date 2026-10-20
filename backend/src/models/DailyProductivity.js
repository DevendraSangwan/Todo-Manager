import mongoose from "mongoose";

const dailyProductivitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    totalTasks: { type: Number, min: 0, required: true },
    completedTasks: { type: Number, min: 0, required: true },
    qualified: { type: Boolean, required: true },
    streak: { type: Number, min: 0, required: true }
  },
  { timestamps: true }
);

dailyProductivitySchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model("DailyProductivity", dailyProductivitySchema);
