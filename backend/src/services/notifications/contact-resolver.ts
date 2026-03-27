import type { AuthUser, MetaBlob } from "../../types/auth";
import type {
  NotificationContact,
  NotificationPreferences,
  NotificationRole
} from "./types";

const roleMap: Record<string, NotificationRole> = {
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT: "PARENT",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "ADMIN"
};

function normalizeRole(input: unknown): NotificationRole | null {
  if (typeof input !== "string") return null;
  const key = input.toUpperCase();
  return roleMap[key] ?? null;
}

function normalizePreferences(value: unknown): NotificationPreferences | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as NotificationPreferences;
}

function parseContact(value: unknown, roleOverride?: NotificationRole): NotificationContact | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role =
    roleOverride ??
    normalizeRole(record.role) ??
    normalizeRole(record.userRole) ??
    normalizeRole(record.type);
  if (!role) {
    return null;
  }

  const idValue =
    record.id ??
    record.userId ??
    record.teacherId ??
    record.studentId ??
    record.parentId ??
    record.profileId;

  const id = typeof idValue === "string" ? idValue : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const email = typeof record.email === "string" ? record.email : undefined;
  const phone = typeof record.phone === "string" ? record.phone : undefined;
  const whatsapp =
    typeof record.whatsapp === "string"
      ? record.whatsapp
      : typeof record.whatsappNumber === "string"
        ? record.whatsappNumber
        : undefined;
  const preferences = normalizePreferences(record.notificationPreferences ?? record.preferences);

  const base: NotificationContact = {
    role,
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(preferences ? { preferences } : {})
  };

  if (!email && !phone && !whatsapp) {
    return base;
  }

  return {
    ...base,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(whatsapp ? { whatsapp } : {})
  };
}

function coerceArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function collectContactsFromMeta(meta?: MetaBlob): NotificationContact[] {
  if (!meta) return [];
  const record = meta as Record<string, unknown>;
  const contacts: NotificationContact[] = [];

  const pushContact = (value: unknown, role?: NotificationRole) => {
    const parsed = parseContact(value, role);
    if (parsed) contacts.push(parsed);
  };

  coerceArray(record.contacts).forEach((entry) => pushContact(entry));
  coerceArray(record.notificationContacts).forEach((entry) => pushContact(entry));
  coerceArray(record.adminContacts).forEach((entry) => pushContact(entry, "ADMIN"));
  coerceArray(record.teacherContacts).forEach((entry) => pushContact(entry, "TEACHER"));
  coerceArray(record.studentContacts).forEach((entry) => pushContact(entry, "STUDENT"));
  coerceArray(record.parentContacts).forEach((entry) => pushContact(entry, "PARENT"));

  const contactObject = record.contact ?? record.schoolContact;
  if (contactObject) {
    pushContact(contactObject);
  }

  const email = typeof record.contactEmail === "string" ? record.contactEmail : undefined;
  const phone = typeof record.contactPhone === "string" ? record.contactPhone : undefined;
  const whatsapp =
    typeof record.contactWhatsapp === "string" ? record.contactWhatsapp : undefined;
  if (email || phone || whatsapp) {
    contacts.push({
      role: "ADMIN",
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(whatsapp ? { whatsapp } : {})
    });
  }

  return contacts;
}

function contactFromUser(user?: AuthUser): NotificationContact[] {
  if (!user) return [];
  const role = normalizeRole(user.role);
  if (!role) return [];
  const email = typeof user.email === "string" ? user.email : undefined;
  const phone = typeof user.phone === "string" ? user.phone : undefined;
  const whatsapp = typeof user.whatsapp === "string" ? user.whatsapp : undefined;
  const name = typeof user.name === "string" ? user.name : undefined;
  const preferences = normalizePreferences(user.notificationPreferences);
  const id =
    role === "TEACHER"
      ? user.teacherId ?? user.id
      : role === "STUDENT"
        ? user.studentId ?? user.id
        : role === "PARENT"
          ? user.parentId ?? user.id
          : user.id;
  if (!email && !phone && !whatsapp) {
    return [];
  }
  return [
    {
      role,
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(preferences ? { preferences } : {})
    }
  ];
}

export function resolveContacts(options: {
  actor?: AuthUser;
  schoolMeta?: MetaBlob;
  subscriptionMeta?: MetaBlob;
  examMeta?: Record<string, unknown>;
  contacts?: NotificationContact[];
}): NotificationContact[] {
  const contacts: NotificationContact[] = [];
  contacts.push(...contactFromUser(options.actor));
  contacts.push(...collectContactsFromMeta(options.schoolMeta));
  contacts.push(...collectContactsFromMeta(options.subscriptionMeta));
  if (options.examMeta) {
    contacts.push(...collectContactsFromMeta(options.examMeta as MetaBlob));
  }
  if (options.contacts) {
    contacts.push(...options.contacts);
  }
  return contacts;
}

export function matchTargets(
  contacts: NotificationContact[],
  targets: { role: NotificationRole; ids?: string[] }[]
): NotificationContact[] {
  const filtered = contacts.filter((contact) =>
    targets.some((target) => {
      if (contact.role !== target.role) return false;
      if (!target.ids || target.ids.length === 0) return true;
      if (!contact.id) return false;
      return target.ids.includes(contact.id);
    })
  );

  const unique = new Map<string, NotificationContact>();
  for (const contact of filtered) {
    const key = [
      contact.role,
      contact.id ?? "",
      contact.email ?? "",
      contact.phone ?? "",
      contact.whatsapp ?? ""
    ].join("|");
    if (!unique.has(key)) {
      unique.set(key, contact);
    }
  }

  return Array.from(unique.values());
}
