import nodemailer from "nodemailer";

function getEmailCredentials() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error("EMAIL_USER and EMAIL_PASS must be configured for Gmail delivery");
  }

  return { user, pass };
}

function createGmailTransporter() {
  const { user, pass } = getEmailCredentials();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass
    }
  });
}

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  label: string;
  fallbackOtp?: string;
};

async function sendMail(input: SendMailInput): Promise<void> {
  const { user } = getEmailCredentials();
  const transporter = createGmailTransporter();

  console.log(`[email] ${input.label} sending started`, {
    to: input.to,
    subject: input.subject
  });

  try {
    const info = await transporter.sendMail({
      from: user,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {})
    });

    console.log(`[email] ${input.label} sent successfully`, {
      to: input.to,
      messageId: info.messageId,
      response: info.response
    });
  } catch (error) {
    console.error(`[email] ${input.label} failed`, {
      to: input.to,
      error: error instanceof Error ? error.message : "Unknown email error"
    });

    if (input.fallbackOtp) {
      console.log(`OTP (fallback): ${input.fallbackOtp}`);
    }

    throw error;
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendMail({
    to,
    subject: "Your OTP Code",
    text: `Your OTP is: ${otp}`,
    html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
    label: "OTP email",
    fallbackOtp: otp
  });
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  await sendMail({
    to,
    subject: "Reset your Adhyay password",
    text: `Reset your password using this link: ${link}`,
    html: `
      <p>Click the link below to reset your Adhyay password.</p>
      <p><a href="${link}">Reset Password</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
    label: "Password reset email"
  });
}

export async function sendVerificationEmail(to: string, link: string): Promise<void> {
  await sendMail({
    to,
    subject: "Verify your Adhyay email",
    text: `Verify your email using this link: ${link}`,
    html: `
      <p>Click the link below to verify your Adhyay email address.</p>
      <p><a href="${link}">Verify Email</a></p>
    `,
    label: "Verification email"
  });
}

export async function sendEmail(to: string, link: string): Promise<void> {
  await sendPasswordResetEmail(to, link);
}
