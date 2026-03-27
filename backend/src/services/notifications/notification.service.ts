import { renderTemplate } from "./render";
import { resolveContacts, matchTargets } from "./contact-resolver";
import { notificationEventCatalog } from "./templates";
import type {
  NotificationAdapter,
  NotificationAttempt,
  NotificationContext,
  NotificationDispatchSummary,
  NotificationMessage,
  NotificationPreferences,
  NotificationTemplateSet
} from "./types";

function maskDestination(value: string, channel: "EMAIL" | "WHATSAPP"): string {
  if (channel === "EMAIL") {
    const [local, domain] = value.split("@");
    if (!domain) return "***";
    const maskedLocal =
      local.length <= 2
        ? "*".repeat(local.length)
        : `${local[0]}***${local.charAt(local.length - 1)}`;
    return `${maskedLocal}@${domain}`;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function shouldSend(
  preferences: NotificationPreferences | undefined,
  channel: "EMAIL" | "WHATSAPP",
  event: NotificationContext["event"]
) {
  if (!preferences) return true;
  const channelPref = preferences.channels?.[channel];
  if (channelPref === false) return false;
  const eventPref = preferences.events?.[event];
  if (eventPref === false) return false;
  return true;
}

function resolveTemplate(
  templates: NotificationTemplateSet,
  channel: "EMAIL" | "WHATSAPP"
) {
  return channel === "EMAIL" ? templates.email : templates.whatsapp;
}

export class NotificationService {
  private adapters: Map<string, NotificationAdapter>;

  constructor(adapters: NotificationAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.channel, adapter]));
  }

  async notify(context: NotificationContext): Promise<NotificationDispatchSummary> {
    const definition = notificationEventCatalog[context.event];
    const targets = context.targets ?? definition.targets;
    const channels = context.channels ?? definition.channels;
    const contacts = matchTargets(
      resolveContacts({
        ...(context.actor ? { actor: context.actor } : {}),
        ...(context.schoolMeta ? { schoolMeta: context.schoolMeta } : {}),
        ...(context.subscriptionMeta ? { subscriptionMeta: context.subscriptionMeta } : {}),
        ...(context.examMeta ? { examMeta: context.examMeta } : {}),
        ...(context.contacts ? { contacts: context.contacts } : {})
      }),
      targets
    );

    const attempts: NotificationAttempt[] = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const contact of contacts) {
      for (const channel of channels) {
        const adapter = this.adapters.get(channel);
        if (!adapter) {
          attempts.push({
            channel,
            recipientRole: contact.role,
            ...(contact.id ? { recipientId: contact.id } : {}),
            status: "skipped",
            reason: "No adapter configured"
          });
          skipped += 1;
          continue;
        }

        if (!adapter.isEnabled()) {
          attempts.push({
            channel,
            recipientRole: contact.role,
            ...(contact.id ? { recipientId: contact.id } : {}),
            status: "skipped",
            reason: "Adapter disabled"
          });
          skipped += 1;
          continue;
        }

        if (!shouldSend(contact.preferences, channel, context.event)) {
          attempts.push({
            channel,
            recipientRole: contact.role,
            ...(contact.id ? { recipientId: contact.id } : {}),
            status: "skipped",
            reason: "Recipient preferences"
          });
          skipped += 1;
          continue;
        }

        const destination =
          channel === "EMAIL"
            ? contact.email
            : contact.whatsapp ?? contact.phone;

        if (!destination) {
          attempts.push({
            channel,
            recipientRole: contact.role,
            ...(contact.id ? { recipientId: contact.id } : {}),
            status: "skipped",
            reason: "Missing destination"
          });
          skipped += 1;
          continue;
        }

        const template = resolveTemplate(definition.templates, channel);
        const variables = {
          recipientName: contact.name ?? "there",
          ...context.variables
        };
        const message: NotificationMessage = {
          channel,
          to: destination,
          ...(template.subject
            ? { subject: renderTemplate(template.subject, variables) }
            : {}),
          body: renderTemplate(template.body, variables),
          meta: { event: context.event }
        };

        const result = await adapter.send(message);
        attempts.push({
          channel,
          recipientRole: contact.role,
          ...(contact.id ? { recipientId: contact.id } : {}),
          to: maskDestination(destination, channel),
          status: result.status,
          ...(result.reason ? { reason: result.reason } : {})
        });

        if (result.status === "sent") sent += 1;
        else if (result.status === "failed") failed += 1;
        else skipped += 1;
      }
    }

    const status =
      sent > 0 && failed === 0 && skipped === 0
        ? "sent"
        : sent > 0
          ? "partial"
          : failed > 0
            ? "failed"
            : "skipped";

    return {
      event: context.event,
      status,
      sent,
      skipped,
      failed,
      attempts
    };
  }
}
