import Link from "next/link";

import { AuthSecondaryAction } from "@/components/auth/AuthSecondaryAction";
import { AuthRoleMotionPanel } from "@/components/auth/AuthRoleMotionPanel";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function RegisterStudentPage() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <AuthPageHeader action={<AuthSecondaryAction />} />
          <SectionHeader
            eyebrow="Student registration"
            title="Student accounts are managed by the school"
            subtitle="Ask your school admin to import students through the admin dashboard."
          />
          <Card className="space-y-4">
            <p className="text-sm text-ink-soft">
              Student self-registration is disabled in this flow.
            </p>
            <Link href="/register">
              <Button variant="outline">Back to registration</Button>
            </Link>
          </Card>
        </div>
        <AuthRoleMotionPanel
          role="student"
          title="Preview the student flow"
          subtitle="A simplified motion panel reflects exam solving and answer selection while the page stays lightweight."
        />
      </div>
    </div>
  );
}
