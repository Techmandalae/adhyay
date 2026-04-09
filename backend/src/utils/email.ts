import { Resend } from "resend";

import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const DEFAULT_FROM = "Adhyay <noreply@adhyay.techmandalae.com>";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  label: string;
  fallbackOtp?: string;
  from?: string;
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
      from: input.from ?? DEFAULT_FROM,
      to: [input.to],
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
  console.log("Sending OTP to:", to, "OTP:", otp);

  return sendWithResend({
    to,
    from: DEFAULT_FROM,
    subject: "Your OTP Code for Adhyay",
    html: `
      <div style="margin:0;padding:30px 16px;background:#f4f6f8;font-family:Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:30px;box-shadow:0 4px 12px rgba(0,0,0,0.05);text-align:center;">
          <h1 style="margin:0 0 10px;color:#ff6a3d;font-size:30px;letter-spacing:1px;">ADHYAY</h1>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

          <p style="margin:0 0 12px;font-size:16px;color:#333;">Hello,</p>

          <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
            Thank you for choosing <b>Adhyay</b>.<br />
            Use this OTP to complete your sign up and verify your account.
          </p>

          <div style="margin:25px 0;">
            <span style="display:inline-block;padding:12px 24px;font-size:24px;letter-spacing:4px;font-weight:bold;color:#ffffff;background:#1f4f66;border-radius:8px;">
              ${otp}
            </span>
          </div>

          <p style="margin:0;font-size:13px;color:#888;">
            This OTP will expire in 10 minutes.
          </p>

          <p style="margin:20px 0 0;font-size:12px;color:#999;line-height:1.6;">
            Never share this OTP with anyone.<br />
            Adhyay will never ask for your OTP.
          </p>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

          <p style="margin:0;font-size:13px;color:#555;">
            Regards,<br />
            <b>Team Adhyay</b>
          </p>
        </div>
      </div>
    `,
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

export async function sendLoginDetailsEmail(params: {
  to: string;
  userId: string;
  schoolId: string;
  email: string;
  tempPassword: string;
}) {
  return sendWithResend({
    to: params.to,
    subject: "Adhyay Login Details",
    html: `
      <div style="margin:0;padding:30px 16px;background:#f4f6f8;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:30px;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align:center;">
            <img
              src="https://adhyay.techmandalae.com/logo-full.png"
              alt="Adhyay"
              width="140"
              style="max-width:100%;height:auto;"
            />
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />

          <h2 style="margin:0 0 14px;color:#1f4f66;font-size:24px;">Your Adhyay account is ready</h2>

          <p style="margin:0 0 10px;font-size:14px;color:#555;"><strong>User ID:</strong> ${params.userId}</p>
          <p style="margin:0 0 10px;font-size:14px;color:#555;"><strong>School ID:</strong> ${params.schoolId || "Independent"}</p>
          <p style="margin:0 0 10px;font-size:14px;color:#555;"><strong>Email:</strong> ${params.email}</p>
          <p style="margin:0 0 18px;font-size:14px;color:#555;"><strong>Password:</strong> ${params.tempPassword}</p>

          <p style="margin:0 0 18px;font-size:14px;color:#555;line-height:1.6;">
            Use the button below to open Adhyay and sign in with your temporary password.
          </p>

          <div style="margin:24px 0;text-align:center;">
            <a
              href="https://adhyay.techmandalae.com"
              style="display:inline-block;padding:12px 24px;background:#ff6a3d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;"
            >
              Open Adhyay
            </a>
          </div>

          <p style="margin:0;font-size:13px;color:#888;">
            This temporary password expires in 7 days. Please change it after login.
          </p>
        </div>
      </div>
    `,
    label: "Login details email"
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
