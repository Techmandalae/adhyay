export type UserRole = "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

export interface AuthUser {
  id: string;
  role: UserRole;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  schoolStatus?: "PENDING" | "ACTIVE" | "SUSPENDED";
  schoolId?: string;
  teacherId?: string;
  studentId?: string;
  parentId?: string;
  adminId?: string;
  classId?: string;
  classLevel?: number;
  sectionId?: string;
  name?: string;
  email?: string;
  publicId?: string;
  emailVerified?: boolean;
  canPublish?: boolean;
  isIndependentTeacher?: boolean;
}
