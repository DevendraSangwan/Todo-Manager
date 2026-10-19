import mongoose from "mongoose";

const taskHistorySchema = new mongoose.Schema(
  {
    todoId: { type: mongoose.Schema.Types.ObjectId, ref: "Todo", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorEmail: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: {
      type: String,
      enum: ["created", "updated", "deleted", "restored", "permanently_deleted"],
      required: true
    },
    changes: [{
      field: { type: String, required: true },
      oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
      newValue: { type: mongoose.Schema.Types.Mixed, default: null }
    }]
  },
  { timestamps: true }
);

taskHistorySchema.index({ classId: 1, actorRole: 1, createdAt: -1 });
taskHistorySchema.index({ ownerId: 1, todoId: 1, createdAt: -1 });

export default mongoose.model("TaskHistory", taskHistorySchema);
