"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import FeedbackModal from "@/components/common/FeedbackModal";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { getRoleRoute } from "@/lib/auth";

function getProfileHref(role?: string) {
  switch (role) {
    case "TEACHER":
      return "/teacher/profile";
    case "STUDENT":
      return "/student/profile";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/admin/profile";
    case "PARENT":
      return "/parent/profile";
    default:
      return "/";
  }
}

export function TopNav() {
  const { token, user, signOut } = useAuth();
  const router = useRouter();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const dashboardHref = getRoleRoute(user?.role);
  const profileHref = getProfileHref(user?.role);

  const identityLabel = user ? user.name ?? user.email ?? "User" : null;

  useEffect(() => {
    router.prefetch(dashboardHref);
    router.prefetch(profileHref);
  }, [dashboardHref, profileHref, router]);

  return (
    <header className="border-b border-border bg-surface px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <Link href={dashboardHref} className="flex items-center gap-2">
          <Logo variant="full" size="md" className="h-14 w-auto" />
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {user ? (
            <>
              {identityLabel ? (
                <span className="rounded-full px-3 py-2 text-sm font-medium text-foreground">
                  {identityLabel}
                </span>
              ) : null}
              <Button variant="outline" onClick={signOut}>
                Logout
              </Button>
            </>
          ) : (
            <Link href="/signin">
              <Button>Sign in</Button>
            </Link>
          )}
        </div>
      </div>
      {user ? (
        <>
          <Button
            type="button"
            className="fixed bottom-6 right-6 z-50 shadow-[0_18px_40px_rgba(255,107,53,0.35)]"
            onClick={() => setFeedbackOpen(true)}
          >
            Feedback
          </Button>
          <FeedbackModal
            open={feedbackOpen}
            onClose={() => setFeedbackOpen(false)}
            token={token}
            user={user}
          />
        </>
      ) : null}
    </header>
  );
}
