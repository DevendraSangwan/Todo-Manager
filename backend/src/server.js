import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "./config/db.js";
import { processReminders } from "./services/reminders.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
const { default: app } = await import("./app.js");

const port = Number(process.env.PORT ?? 5000);

try {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  await connectDatabase();
  app.listen(port, () => console.info(`API listening on port ${port}`));
  const runReminders = () => processReminders().catch((error) => console.error("Reminder processing failed:", error));
  runReminders();
  setInterval(runReminders, 60_000);
} catch (error) {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
}
