import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    kind: { type: String, enum: ["join_class", "friend_access"], required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", required: true }
  },
  { timestamps: true }
);

accessRequestSchema.index({ requesterId: 1, classId: 1, kind: 1, status: 1 });
accessRequestSchema.index({ requesterId: 1, recipientId: 1, kind: 1, status: 1 });

export default mongoose.model("AccessRequest", accessRequestSchema);
