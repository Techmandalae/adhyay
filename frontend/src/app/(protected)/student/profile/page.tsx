"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default function StudentProfilePage() {
  return (
    <RequireRole roles={["STUDENT"]}>
      <ProfileForm
        title="Student profile"
        subtitle="Keep your academic and contact details updated."
      />
    </RequireRole>
  );
}
