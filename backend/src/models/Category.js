import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    color: { type: String, match: /^#[a-f\d]{6}$/i, default: "#7465d7" }
  },
  { timestamps: true }
);

categorySchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model("Category", categorySchema);
