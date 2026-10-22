import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import Announcement from "./models/Announcement.js";
import Assignment from "./models/Assignment.js";
import AssignmentSubmission from "./models/AssignmentSubmission.js";
import Category from "./models/Category.js";
import Class from "./models/Class.js";
import Goal from "./models/Goal.js";
import Habit from "./models/Habit.js";
import Todo from "./models/Todo.js";
import User from "./models/User.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const demoUsers = [
  {
    email: "admin@gmail.com",
    legacyEmail: "admin.demo@daymark.test",
    password: "admin123",
    displayName: "Demo Admin",
    role: "SUPER_ADMIN",
    accountType: "personal"
  },
  {
    email: "teacher1@gmail.com",
    legacyEmail: "teacher1.demo@daymark.test",
    password: "12345678",
    displayName: "Avery Teacher",
    role: "TEACHER_ADMIN",
    accountType: "class"
  },
  {
    email: "teacher2@gmail.com",
    legacyEmail: "teacher2.demo@daymark.test",
    password: "12345678",
    displayName: "Jordan Teacher",
    role: "TEACHER_ADMIN",
    accountType: "class"
  }
];
const demoStudents = [
  { email: "student1@gmail.com", legacyEmail: "student1.demo@daymark.test", password: "12345678", displayName: "Taylor Student", classIndex: 0 },
  { email: "student2@gmail.com", legacyEmail: "student2.demo@daymark.test", password: "12345678", displayName: "Riley Student", classIndex: 0 },
  { email: "student3@gmail.com", legacyEmail: "student3.demo@daymark.test", password: "12345678", displayName: "Casey Student", classIndex: 1 }
];

async function ensureUser({ email, legacyEmail, password, displayName, role, accountType, classId = null }) {
  if (legacyEmail) {
    const targetExists = await User.exists({ email });
    const legacyUser = await User.findOne({ email: legacyEmail });
    if (!targetExists && legacyUser) {
      await User.updateOne({ _id: legacyUser._id }, { $set: { email } });
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return User.findOneAndUpdate(
    { email },
    {
      $set: {
        displayName,
        role,
        accountType,
        classId,
        emailVerified: true,
        setupComplete: true,
        password: passwordHash
      }
    },
    { upsert: true, new: true, runValidators: true }
  );
}

async function upsertForUser(Model, userId, key, values) {
  return Model.findOneAndUpdate(
    { userId, ...key },
    { $set: values, $setOnInsert: { userId, ...key } },
    { upsert: true, new: true, runValidators: true }
  );
}

async function seedDemoData() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed data is disabled when NODE_ENV=production.");
  }
  if (process.env.SEED_DEMO_DATA !== "true") {
    throw new Error("Set SEED_DEMO_DATA=true in the root .env to confirm demo seeding.");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required.");
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME ?? "Todo_manager"
  });

  try {
    await ensureUser(demoUsers[0]);

    const teachers = [];
    const classes = [];
    for (const [index, teacherData] of demoUsers.slice(1).entries()) {
      const teacher = await ensureUser(teacherData);
      const classroom = await Class.findOneAndUpdate(
        { teacherId: teacher._id },
        {
          $set: {
            name: `Demo Class ${index + 1}`,
            description: `Sample classroom managed by ${teacher.displayName}.`
          },
          $setOnInsert: { teacherId: teacher._id }
        },
        { upsert: true, new: true, runValidators: true }
      );
      teachers.push(teacher);
      classes.push(classroom);
    }

    const students = [];
    for (const studentData of demoStudents) {
      const student = await ensureUser(
        {
          email: studentData.email,
          legacyEmail: studentData.legacyEmail,
          password: studentData.password,
          displayName: studentData.displayName,
          role: "STUDENT",
          accountType: "class",
          classId: classes[studentData.classIndex]._id
        }
      );
      students.push(student);
    }

    const now = new Date();
    for (const [index, student] of students.entries()) {
      const category = await upsertForUser(
        Category,
        student._id,
        { name: "Study" },
        { color: "#7465d7" }
      );
      await upsertForUser(
        Goal,
        student._id,
        { title: "Build a consistent study routine" },
        {
          description: "Complete focused study sessions throughout the week.",
          targetDate: new Date(now.getTime() + 30 * 86_400_000),
          milestones: [
            { title: "Plan the week's study sessions" },
            { title: "Finish three focused sessions" }
          ]
        }
      );
      await upsertForUser(
        Habit,
        student._id,
        { name: "Read for 20 minutes" },
        {}
      );
      await Todo.findOneAndUpdate(
        { userId: student._id, title: "Review this week's class notes" },
        {
          $set: {
            description: "Summarize key ideas and write down any questions.",
            dueDate: new Date(now.getTime() + (index + 1) * 86_400_000),
            categoryId: category._id,
            status: "pending",
            priority: "important-not-urgent",
            visibility: "private"
          },
          $setOnInsert: { userId: student._id, classId: null }
        },
        { upsert: true, new: true, runValidators: true }
      );
      await Todo.findOneAndUpdate(
        { userId: student._id, title: "Plan tomorrow's study session" },
        {
          $set: {
            description: "Choose one topic and prepare the materials.",
            dueDate: new Date(now.getTime() + 2 * 86_400_000),
            categoryId: category._id,
            status: "completed",
            priority: "neither",
            visibility: "private"
          },
          $setOnInsert: { userId: student._id, classId: null }
        },
        { upsert: true, new: true, runValidators: true }
      );
    }

    for (const [classIndex, classroom] of classes.entries()) {
      const teacher = teachers[classIndex];
      const classStudents = students.filter(
        (_, studentIndex) => demoStudents[studentIndex].classIndex === classIndex
      );
      const assignment = await Assignment.findOneAndUpdate(
        { classId: classroom._id, title: `Demo Assignment ${classIndex + 1}: Weekly reflection` },
        {
          $set: {
            teacherId: teacher._id,
            description: "Write a short reflection on one idea you learned this week.",
            dueDate: new Date(now.getTime() + 7 * 86_400_000),
            studentIds: classStudents.map((student) => student._id)
          },
          $setOnInsert: { classId: classroom._id }
        },
        { upsert: true, new: true, runValidators: true }
      );
      await Announcement.findOneAndUpdate(
        { classId: classroom._id, title: `Welcome to Demo Class ${classIndex + 1}` },
        {
          $set: {
            teacherId: teacher._id,
            message: "Welcome! Check your assignments and remember to plan your study time."
          },
          $setOnInsert: { classId: classroom._id }
        },
        { upsert: true, new: true, runValidators: true }
      );

      for (const [studentIndex, student] of classStudents.entries()) {
        await AssignmentSubmission.findOneAndUpdate(
          { assignmentId: assignment._id, studentId: student._id },
          {
            $set: {
              classId: classroom._id,
              submittedAt: studentIndex === 0 ? now : null,
              response: studentIndex === 0
                ? "I learned how to break a large task into smaller steps."
                : ""
            },
            $setOnInsert: { assignmentId: assignment._id, studentId: student._id }
          },
          { upsert: true, new: true, runValidators: true }
        );
      }
    }

    console.info(`Seeded ${1 + teachers.length + students.length} verified demo accounts and ${classes.length} classes with tasks, goals, habits, assignments, submissions, and announcements in "${mongoose.connection.name}".`);
    console.info("Demo credentials (seeding resets passwords for these demo accounts):");
    for (const user of [...demoUsers, ...demoStudents]) {
      console.info(`  ${user.email} | ${user.password}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoData().catch((error) => {
  console.error("Demo data seeding failed:", error.message);
  process.exitCode = 1;
});
