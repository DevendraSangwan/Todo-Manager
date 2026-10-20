import mongoose from "mongoose";

const focusSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    todoId: { type: mongoose.Schema.Types.ObjectId, ref: "Todo", required: true },
    type: { type: String, enum: ["focus", "short-break", "long-break"], required: true },
    minutes: { type: Number, min: 1, max: 600, required: true },
    completedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

focusSessionSchema.index({ userId: 1, completedAt: -1 });

export default mongoose.model("FocusSession", focusSessionSchema);
