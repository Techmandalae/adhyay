import nodemailer from "nodemailer";

import { env } from "../config/env";

function createTransporter() {
  const smtpUser = env.SMTP_USER ?? env.EMAIL_USER;
  const smtpPass = env.SMTP_PASS ?? env.EMAIL_PASS;

  if (!smtpUser || !smtpPass) {
    throw new Error("Email transport is not configured");
  }

  const transporter =
    env.SMTP_HOST && env.SMTP_PORT
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        })
      : nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });

  return transporter;
}

function getFromAddress() {
  return env.SMTP_FROM_EMAIL ?? env.SMTP_USER ?? env.EMAIL_USER;
}

async function sendMailWithLogging(payload: {
  to: string;
  subject: string;
  html: string;
  debugLabel: string;
  debugOtp?: string;
}) {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: getFromAddress(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html
    });
    console.log(`${payload.debugLabel} sent successfully to:`, payload.to);
    return { delivered: true as const };
  } catch (error) {
    console.error(`${payload.debugLabel} failed for:`, payload.to, error);
    if (payload.debugOtp) {
      console.log("OTP (fallback):", payload.debugOtp);
    }
    return {
      delivered: false as const,
      error: error instanceof Error ? error.message : "Unknown email error"
    };
  }
}

export async function sendPasswordResetEmail(to: string, link: string) {
  const result = await sendMailWithLogging({
    to,
    debugLabel: "Password reset email",
    subject: "Reset your Adhyay password",
    html: `
      <p>Click the link below to reset your Adhyay password.</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>This link expires in 15 minutes.</p>
    `
  });

  if (!result.delivered) {
    throw new Error(result.error);
  }
}

export async function sendVerificationEmail(to: string, link: string) {
  const result = await sendMailWithLogging({
    to,
    debugLabel: "Verification email",
    subject: "Verify your Adhyay email",
    html: `
      <p>Click the link below to verify your Adhyay email address.</p>
      <p><a href="${link}">Verify Email</a></p>
    `
  });

  if (!result.delivered) {
    throw new Error(result.error);
  }
}

export async function sendOtpEmail(to: string, otp: string) {
  console.log("Sending OTP to:", to, "OTP:", otp);
  return sendMailWithLogging({
    to,
    subject: "Your Adhyay OTP Code",
    html: `
      <p>Use the OTP below to verify your Adhyay account.</p>
      <h2>${otp}</h2>
      <p>This OTP expires in 10 minutes.</p>
    `,
    debugLabel: "OTP email",
    debugOtp: otp
  });
}

export async function sendEmail(to: string, link: string) {
  return sendPasswordResetEmail(to, link);
}
