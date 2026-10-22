import mongoose from "mongoose";

const authTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

export default mongoose.model("AuthToken", authTokenSchema);
