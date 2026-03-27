import type { MetaBlob } from "../../types/auth";
import type { AuthUser } from "../../types/auth";

export type NotificationChannel = "EMAIL" | "WHATSAPP";
export type NotificationEvent =
  | "EXAM_GENERATED"
  | "ANSWER_UPLOADED"
  | "TEACHER_APPROVAL_REQUEST"
  | "EVALUATION_APPROVED"
  | "EVALUATION_REJECTED"
  | "REPORT_AVAILABLE"
  | "USAGE_LIMIT_WARNING";
export type NotificationRole = "TEACHER" | "STUDENT" | "PARENT" | "ADMIN";

export type NotificationPreferences = {
  channels?: Partial<Record<NotificationChannel, boolean>>;
  events?: Partial<Record<NotificationEvent, boolean>>;
};

export type NotificationContact = {
  role: NotificationRole;
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferences?: NotificationPreferences;
};

export type NotificationTarget = {
  role: NotificationRole;
  ids?: string[];
};

export type NotificationTemplate = {
  subject?: string;
  body: string;
};

export type NotificationTemplateSet = {
  email: NotificationTemplate;
  whatsapp: NotificationTemplate;
};

export type NotificationEventDefinition = {
  targets: NotificationTarget[];
  channels: NotificationChannel[];
  templates: NotificationTemplateSet;
};

export type NotificationMessage = {
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
  meta?: Record<string, unknown>;
};

export type NotificationSendResult = {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  provider?: string;
};

export type NotificationAttempt = {
  channel: NotificationChannel;
  recipientRole: NotificationRole;
  recipientId?: string;
  to?: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

export type NotificationDispatchSummary = {
  event: NotificationEvent;
  status: "sent" | "partial" | "skipped" | "failed";
  sent: number;
  skipped: number;
  failed: number;
  attempts: NotificationAttempt[];
};

export type NotificationContext = {
  event: NotificationEvent;
  actor?: AuthUser;
  schoolMeta?: MetaBlob;
  subscriptionMeta?: MetaBlob;
  examMeta?: Record<string, unknown>;
  contacts?: NotificationContact[];
  targets?: NotificationTarget[];
  channels?: NotificationChannel[];
  variables?: Record<string, string | number | boolean | null | undefined>;
};

export type NotificationAdapter = {
  channel: NotificationChannel;
  isEnabled: () => boolean;
  send: (message: NotificationMessage) => Promise<NotificationSendResult>;
};
