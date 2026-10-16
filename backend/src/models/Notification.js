import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
