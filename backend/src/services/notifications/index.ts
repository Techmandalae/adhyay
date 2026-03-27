import { createEmailAdapter } from "./adapters/email.adapter";
import { createWhatsappAdapter } from "./adapters/whatsapp.adapter";
import { NotificationService } from "./notification.service";

export const notificationService = new NotificationService([
  createEmailAdapter(),
  createWhatsappAdapter()
]);

export * from "./types";
