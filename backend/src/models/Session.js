import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenId: { type: String, required: true, unique: true },
  userAgent: { type: String, maxlength: 300, default: "" },
  ipAddress: { type: String, maxlength: 64, default: "" },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

export default mongoose.model("Session", sessionSchema);
