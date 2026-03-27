import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

export default function RegisterParentPage() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-8">
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
    </div>
  );
}
