import mongoose from "mongoose";

const reminderDeliverySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  todoId: { type: mongoose.Schema.Types.ObjectId, ref: "Todo", required: true },
  dueDate: { type: Date, required: true },
  channel: { type: String, enum: ["email", "in_app"], required: true },
  sentAt: { type: Date, default: Date.now }
}, { timestamps: true });

reminderDeliverySchema.index({ todoId: 1, dueDate: 1, channel: 1 }, { unique: true });

export default mongoose.model("ReminderDelivery", reminderDeliverySchema);
