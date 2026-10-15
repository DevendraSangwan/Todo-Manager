import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import todoRoutes from "./routes/todos.js";
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
app.use(notFound);
app.use(errorHandler);

export default app;
