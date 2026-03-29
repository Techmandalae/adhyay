import { Resend } from "resend";

import { env } from "../../../config/env";
import type { NotificationAdapter, NotificationMessage, NotificationSendResult } from "../types";

function getResendClient() {
  const apiKey = env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

function isConfigured() {
  return Boolean(env.RESEND_API_KEY);
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
        return { status: "skipped", reason: "Resend not configured" };
      }

      if (!message.to) {
        return { status: "skipped", reason: "Missing recipient" };
      }

      if (!env.NOTIFICATIONS_ENABLED || !env.NOTIFICATION_EMAIL_ENABLED) {
        return { status: "skipped", reason: "Email notifications disabled" };
      }

      try {
        const resend = getResendClient();
        if (!resend) {
          return { status: "skipped", reason: "Resend not configured" };
        }

        await resend.emails.send({
          from: "Adhyay <onboarding@resend.dev>",
          to: message.to,
          subject: message.subject ?? "Adhyay notification",
          text: message.body
        });

        return { status: "sent", provider: "resend" };
      } catch (error) {
        return {
          status: "failed",
          reason: error instanceof Error ? error.message : "Email send failed"
        };
      }
    }
  };
}
