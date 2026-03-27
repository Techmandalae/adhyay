export type NotificationChannel = "EMAIL" | "WHATSAPP";
export type NotificationEvent =
  | "EXAM_GENERATED"
  | "ANSWER_UPLOADED"
  | "TEACHER_APPROVAL_REQUEST"
  | "EVALUATION_APPROVED"
  | "EVALUATION_REJECTED"
  | "REPORT_AVAILABLE"
  | "USAGE_LIMIT_WARNING";
export type NotificationStatus = "sent" | "partial" | "skipped" | "failed";

export interface NotificationAttempt {
  channel: NotificationChannel;
  recipientRole: "TEACHER" | "STUDENT" | "PARENT" | "ADMIN";
  recipientId?: string;
  to?: string;
  status: NotificationStatus;
  reason?: string;
}

export interface NotificationDispatchSummary {
  event: NotificationEvent;
  status: NotificationStatus;
  sent: number;
  skipped: number;
  failed: number;
  attempts: NotificationAttempt[];
}
