import nodemailer from "nodemailer";

export function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    (!process.env.SMTP_USER || process.env.SMTP_PASSWORD)
  );
}

export async function sendEmail({ to, subject, text }) {
  if (!smtpConfigured()) {
    const error = new Error("SMTP is not configured. Set SMTP_HOST and SMTP_FROM.");
    error.status = 503;
    throw error;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    ...(process.env.SMTP_USER ? {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
    } : {})
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
