"use client";

import { RequireRole } from "@/components/auth/RequireRole";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default function AdminProfilePage() {
  return (
    <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>
      <ProfileForm
        title="Admin profile"
        subtitle="Update your account details and school contact information."
      />
    </RequireRole>
  );
}
