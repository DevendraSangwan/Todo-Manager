import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, required: true, select: false },
    displayName: { type: String, trim: true, maxlength: 80, default: "" },
    theme: { type: String, enum: ["light", "dark"], default: "light" },
    timezone: { type: String, trim: true, maxlength: 80, default: "UTC" },
    notificationPreferences: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      browser: { type: Boolean, default: false }
    },
    reminderMinutes: { type: Number, enum: [0, 5, 10, 15, 30, 60], default: 15 },
    aiDataPermission: { type: Boolean, default: true },
    reducedMotion: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER_ADMIN", "SUPER_ADMIN"],
      default: "STUDENT",
      required: true
    },
    accountType: {
      type: String,
      enum: ["personal", "class"],
      default: "personal"
    },
    setupComplete: { type: Boolean, default: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", default: null },
    chronotype: { type: String, enum: ["morning", "night"], default: null },
    dailyGoalHours: { type: Number, min: 0.5, max: 16, default: 2 },
    interests: { type: [String], default: [] },
    aiAlwaysAllowActions: {
      type: [String],
      enum: ["add_todo", "move_todo"],
      default: []
    },
    leaderboardOptIn: { type: Boolean, default: false },
    xp: { type: Number, min: 0, default: 0 },
    currentStreak: { type: Number, min: 0, default: 0 },
    bestStreak: { type: Number, min: 0, default: 0 },
    lastStreakDate: { type: String, default: null },
    focusSettings: {
      focusMinutes: { type: Number, min: 1, max: 180, default: 25 },
      shortBreakMinutes: { type: Number, min: 1, max: 60, default: 5 },
      longBreakMinutes: { type: Number, min: 1, max: 120, default: 15 },
      longBreakInterval: { type: Number, min: 2, max: 8, default: 4 }
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
