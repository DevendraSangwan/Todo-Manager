import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import todoRoutes from "./routes/todos.js";
import classRoutes from "./routes/classes.js";
import adminRoutes from "./routes/admin.js";
import requestRoutes from "./routes/requests.js";
import notificationRoutes from "./routes/notifications.js";
import friendRoutes from "./routes/friends.js";
import teacherAuditRoutes from "./routes/teacherAudit.js";
import { errorHandler, notFound } from "./middleware/errors.js";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL ?? "http://localhost:5173",
  credentials: true
}));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/teacher-audit", teacherAuditRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
