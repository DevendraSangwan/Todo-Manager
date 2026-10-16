import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

classSchema.index({ teacherId: 1 }, { unique: true, partialFilterExpression: { teacherId: { $type: "objectId" } } });

export default mongoose.model("Class", classSchema);
