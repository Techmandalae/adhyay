import type { JwtPayload } from "jsonwebtoken";

export type MetaBlob = Record<string, unknown>;

export type AuthUser = JwtPayload & {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  schoolStatus?: "PENDING" | "ACTIVE" | "SUSPENDED";
  schoolId: string;
  teacherId?: string;
  studentId?: string;
  studentIds?: string[];
  parentId?: string;
  adminId?: string;
  classId?: string;
  classLevel?: number;
  sectionId?: string;
  name?: string;
  email?: string;
  publicId?: string;
  emailVerified?: boolean;
  mustChangePassword?: boolean;
  canPublish?: boolean;
  isIndependentTeacher?: boolean;
  phone?: string;
  whatsapp?: string;
  notificationPreferences?: {
    channels?: Partial<Record<"EMAIL" | "WHATSAPP", boolean>>;
    events?: Partial<
      Record<
        | "EXAM_GENERATED"
        | "ANSWER_UPLOADED"
        | "TEACHER_APPROVAL_REQUEST"
        | "EVALUATION_APPROVED"
        | "EVALUATION_REJECTED"
        | "REPORT_AVAILABLE"
        | "USAGE_LIMIT_WARNING",
        boolean
      >
    >;
  };
  school?: { meta?: MetaBlob };
  subscription?: { meta?: MetaBlob };
  schoolMeta?: MetaBlob;
  subscriptionMeta?: MetaBlob;
};
