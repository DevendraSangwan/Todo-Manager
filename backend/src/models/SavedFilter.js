import mongoose from "mongoose";

const savedFilterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    filters: {
      search: { type: String, default: "" },
      status: { type: String, enum: ["pending", "completed", "all"], default: "all" },
      priority: { type: String, default: "" },
      date: { type: String, default: "" },
      overdue: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

savedFilterSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model("SavedFilter", savedFilterSchema);
