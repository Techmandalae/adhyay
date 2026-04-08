import Link from "next/link";

import { AuthSecondaryAction } from "@/components/auth/AuthSecondaryAction";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";

const options = [
  {
    title: "Register as School",
    description: "Create a new school and principal account for approval.",
    href: "/register/school"
  },
  {
    title: "Register as Teacher",
    description: "Create a teacher account with or without a school ID.",
    href: "/register/teacher"
  }
];

export default function RegisterSelectorPage() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-5xl space-y-8">
        <AuthPageHeader action={<AuthSecondaryAction />} />
        <SectionHeader
          eyebrow="Get started"
          title="Choose your registration path"
          subtitle="Select the registration flow that matches your setup."
        />
        <div className="grid gap-6 md:grid-cols-2">
          {options.map((option) => (
            <Card key={option.href} className="flex h-full flex-col gap-4">
              <div>
                <p className="text-lg font-semibold">{option.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{option.description}</p>
              </div>
              <Link href={option.href} className="mt-auto">
                <Button variant="outline">Continue</Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
