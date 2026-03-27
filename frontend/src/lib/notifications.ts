import type { NotificationDispatchSummary } from "@/types/notifications";

export function summarizeNotifications(
  notifications?: NotificationDispatchSummary | NotificationDispatchSummary[]
): string | null {
  if (!notifications) return null;
  const list = Array.isArray(notifications) ? notifications : [notifications];
  if (list.length === 0) return null;
  const totals = list.reduce(
    (acc, item) => ({
      sent: acc.sent + item.sent,
      skipped: acc.skipped + item.skipped,
      failed: acc.failed + item.failed
    }),
    { sent: 0, skipped: 0, failed: 0 }
  );
  return `Notifications: ${totals.sent} sent, ${totals.skipped} skipped, ${totals.failed} failed.`;
}
