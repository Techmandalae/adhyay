import { Resend } from "resend";

import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const DEFAULT_FROM = "Adhyay <onboarding@resend.dev>";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  label: string;
  fallbackOtp?: string;
};

async function sendWithResend(input: SendEmailInput): Promise<boolean> {
  if (!env.NOTIFICATION_EMAIL_ENABLED) {
    console.log(`[email] ${input.label} skipped because email notifications are disabled`, {
      to: input.to
    });

    if (input.fallbackOtp) {
      console.log("OTP (fallback):", input.fallbackOtp);
    }

    return false;
  }

  if (!resend) {
    console.error(`[email] ${input.label} failed: RESEND_API_KEY is not configured`, {
      to: input.to
    });

    if (input.fallbackOtp) {
      console.log("OTP (fallback):", input.fallbackOtp);
    }

    return false;
  }

  console.log(`[email] ${input.label} sending started`, {
    to: input.to,
    subject: input.subject
  });

  try {
    const response = await resend.emails.send({
      from: DEFAULT_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html
    });

    console.log(`[email] ${input.label} sent successfully`, response);

    if (input.fallbackOtp) {
      console.log("OTP (fallback):", input.fallbackOtp);
    }

    return true;
  } catch (error) {
    console.error(`[email] ${input.label} failed`, error);

    if (input.fallbackOtp) {
      console.log("OTP (fallback):", input.fallbackOtp);
    }

    return false;
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  return sendWithResend({
    to,
    subject: "Verify your email",
    html: `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    label: "OTP email",
    fallbackOtp: otp
  });
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
  return sendWithResend({
    to,
    subject: "Reset your Adhyay password",
    html: `
      <p>Click the link below to reset your Adhyay password.</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
    label: "Password reset email"
  });
}

export async function sendVerificationEmail(to: string, link: string): Promise<boolean> {
  return sendWithResend({
    to,
    subject: "Verify your Adhyay email",
    html: `
      <p>Click the link below to verify your Adhyay email address.</p>
      <p><a href="${link}">Verify Email</a></p>
    `,
    label: "Verification email"
  });
}

export async function sendEmail(to: string, link: string): Promise<boolean> {
  return sendPasswordResetEmail(to, link);
}
