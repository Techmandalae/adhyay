import Link from "next/link";

import { AuthSecondaryAction } from "@/components/auth/AuthSecondaryAction";
import { AuthRoleMotionPanel } from "@/components/auth/AuthRoleMotionPanel";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function RegisterParentPage() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <AuthPageHeader action={<AuthSecondaryAction />} />
          <SectionHeader
            eyebrow="Parent registration"
            title="Parent accounts are created from student imports"
            subtitle="Parent access is created automatically when an admin imports student records."
          />
          <Card className="space-y-4">
            <p className="text-sm text-ink-soft">
              Parent self-registration is disabled in this flow.
            </p>
            <Link href="/register">
              <Button variant="outline">Back to registration</Button>
            </Link>
          </Card>
        </div>
        <AuthRoleMotionPanel
          role="parent"
          title="Preview the parent tracking view"
          subtitle="A compact progress-focused motion panel suggests student performance tracking without affecting page load."
        />
      </div>
    </div>
  );
}
