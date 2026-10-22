import crypto from "node:crypto";
import AuthToken from "../models/AuthToken.js";
import { sendEmail, smtpConfigured } from "./email.js";

export function hashAuthToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createAndSendAuthToken(user, purpose) {
  if (!smtpConfigured()) {
    const error = new Error("Email delivery is unavailable. Configure SMTP and try again.");
    error.status = 503;
    throw error;
  }
  const token = crypto.randomBytes(32).toString("hex");
  await AuthToken.deleteMany({ userId: user._id, purpose });
  await AuthToken.create({
    userId: user._id,
    purpose,
    tokenHash: hashAuthToken(token),
    expiresAt: new Date(Date.now() + (purpose === "verify_email" ? 24 : 1) * 60 * 60 * 1000)
  });
  const clientUrl = (process.env.APP_URL ?? process.env.CLIENT_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  const path = purpose === "verify_email" ? "/verify-email" : "/reset-password";
  const action = purpose === "verify_email" ? "verify your email address" : "reset your password";
  await sendEmail({
    to: user.email,
    subject: purpose === "verify_email" ? "Verify your Daymark email" : "Reset your Daymark password",
    text: `Use this link to ${action}: ${clientUrl}${path}?token=${token}\nThis link expires in ${purpose === "verify_email" ? "24 hours" : "1 hour"}.`
  });
}
