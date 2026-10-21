import mongoose from "mongoose";

const aiActionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actionType: { type: String, enum: ["add_todo", "move_todo"], required: true },
    status: { type: String, enum: ["pending", "applying", "applied", "undone"], default: "pending", index: true },
    payload: {
      title: { type: String, trim: true, maxlength: 120 },
      description: { type: String, trim: true, maxlength: 2000, default: "" },
      dueDate: { type: Date },
      priority: { type: String, maxlength: 40 },
      estimatedMinutes: { type: Number, min: 0, max: 100000 }
    },
    todoId: { type: mongoose.Schema.Types.ObjectId, ref: "Todo", default: null },
    previousValues: {
      dueDate: { type: Date },
      priority: { type: String }
    },
    appliedAt: { type: Date, default: null },
    undoneAt: { type: Date, default: null }
  },
  { timestamps: true }
);

aiActionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("AIAction", aiActionSchema);
