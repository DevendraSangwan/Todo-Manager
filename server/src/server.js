import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import app from "./app.js";
import { connectDatabase } from "./config/db.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const port = Number(process.env.PORT ?? 5000);

try {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  await connectDatabase();
  app.listen(port, () => console.info(`API listening on port ${port}`));
} catch (error) {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
}
