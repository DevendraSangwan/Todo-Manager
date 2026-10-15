import mongoose from "mongoose";

const todoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      required: true
    },
    dueDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
      required: true
    },
    completionNote: { type: String, trim: true, maxlength: 1000, default: "" }
  },
  { timestamps: true }
);

todoSchema.index({ userId: 1, dueDate: 1 });

export default mongoose.model("Todo", todoSchema);
