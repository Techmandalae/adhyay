import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../../../config/env";
import type { NotificationAdapter, NotificationMessage, NotificationSendResult } from "../types";

let transporter: Transporter | null = null;

function isConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM_EMAIL);
}

function getTransporter(): Transporter {
  if (!transporter) {
    const port = env.SMTP_PORT ?? 587;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ?? false,
      ...(env.SMTP_USER
        ? {
            auth: {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS ?? ""
            }
          }
        : {})
    });
  }
  return transporter;
}

export function createEmailAdapter(): NotificationAdapter {
  return {
    channel: "EMAIL",
    isEnabled: () =>
      env.NOTIFICATIONS_ENABLED &&
      env.NOTIFICATION_EMAIL_ENABLED &&
      isConfigured(),
    async send(message: NotificationMessage): Promise<NotificationSendResult> {
      if (!isConfigured()) {
        return { status: "skipped", reason: "SMTP not configured" };
      }

      if (!message.to) {
        return { status: "skipped", reason: "Missing recipient" };
      }

      if (!env.NOTIFICATIONS_ENABLED || !env.NOTIFICATION_EMAIL_ENABLED) {
        return { status: "skipped", reason: "Email notifications disabled" };
      }

      try {
        const mailer = getTransporter();
        await mailer.sendMail({
          from: {
            name: env.SMTP_FROM_NAME ?? "Adhyay",
            address: env.SMTP_FROM_EMAIL ?? ""
          },
          to: message.to,
          subject: message.subject ?? "Adhyay notification",
          text: message.body
        });
        return { status: "sent", provider: "smtp" };
      } catch (error) {
        return {
          status: "failed",
          reason: error instanceof Error ? error.message : "Email send failed"
        };
      }
    }
  };
}
