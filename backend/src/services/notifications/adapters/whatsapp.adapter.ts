import { env } from "../../../config/env";
import type { NotificationAdapter, NotificationMessage, NotificationSendResult } from "../types";

export function createWhatsappAdapter(): NotificationAdapter {
  return {
    channel: "WHATSAPP",
    isEnabled: () =>
      env.NOTIFICATIONS_ENABLED && env.NOTIFICATION_WHATSAPP_ENABLED,
    async send(_message: NotificationMessage): Promise<NotificationSendResult> {
      if (!env.NOTIFICATIONS_ENABLED || !env.NOTIFICATION_WHATSAPP_ENABLED) {
        return { status: "skipped", reason: "WhatsApp notifications disabled" };
      }
      return { status: "skipped", reason: "WhatsApp provider not configured" };
    }
  };
}
