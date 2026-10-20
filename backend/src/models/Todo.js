import mongoose from "mongoose";

const todoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    priority: {
      type: String,
      enum: [
        "urgent-important", "important-not-urgent",
        "urgent-not-important", "neither",
        "low", "medium", "high"
      ],
      default: "important-not-urgent",
      required: true
    },
    subtasks: [{
      title: { type: String, trim: true, required: true, maxlength: 120 },
      completed: { type: Boolean, default: false }
    }],
    repeatFrequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", null],
      default: null
    },
    nextOccurrenceCreated: { type: Boolean, default: false },
    dueDate: { type: Date, required: true, index: true },
    estimatedMinutes: { type: Number, min: 0, max: 100000, default: 0 },
    actualMinutes: { type: Number, min: 0, max: 100000, default: 0 },
    xpAwarded: { type: Boolean, default: false },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Todo" }],
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
      required: true
    },
    visibility: {
      type: String,
      enum: ["private", "classmates", "public"],
      default: "private",
      required: true
    },
    completionNote: { type: String, trim: true, maxlength: 1000, default: "" },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

todoSchema.index({ userId: 1, dueDate: 1 });
todoSchema.index({ classId: 1, visibility: 1, dueDate: 1 });
todoSchema.index({ userId: 1, deletedAt: 1, dueDate: 1 });

export default mongoose.model("Todo", todoSchema);
