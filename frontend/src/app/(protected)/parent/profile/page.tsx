"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default function ParentProfilePage() {
  return (
    <RequireRole roles={["PARENT"]}>
      <ProfileForm
        title="Parent profile"
        subtitle="Update your contact details for student report access."
      />
    </RequireRole>
  );
}
