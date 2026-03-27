import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

export default function HomePage() {
  return (
    <div className="app-shell min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <Card className="mx-auto max-w-2xl bg-white/80">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">{APP_NAME}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold">{APP_NAME}</h1>
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
