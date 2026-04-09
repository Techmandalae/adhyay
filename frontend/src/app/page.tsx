import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

export default function HomePage() {
  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <div className="mb-8 flex flex-col items-center gap-5">
          <Logo variant="full" size="lg" className="h-24 w-auto md:h-28" />
          <h1 className="font-display text-5xl font-semibold text-foreground md:text-6xl">
            {APP_NAME}
          </h1>
        </div>
        <Card className="mx-auto max-w-2xl bg-white/80">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">Smart exam platform</p>
          <p className="mt-3 text-sm text-ink-soft">{APP_TAGLINE}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signin">
              <Button>Sign In</Button>
            </Link>
            <Link href="/register">
              <Button variant="outline">Register</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
