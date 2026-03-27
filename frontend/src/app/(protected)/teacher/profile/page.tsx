"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default function TeacherProfilePage() {
  return (
    <RequireRole roles={["TEACHER"]}>
      <ProfileForm
        title="Teacher profile"
        subtitle="Update your teaching, contact, and professional details."
      />
    </RequireRole>
  );
}
