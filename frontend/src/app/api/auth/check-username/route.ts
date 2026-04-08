import { NextRequest, NextResponse } from "next/server";

import {
  buildUsernameSuggestions,
  sanitizeUsername
} from "@/lib/username";

const FALLBACK_API_BASE =
  process.env.NODE_ENV === "production"
    ? "https://api.adhyay.techmandalae.com"
    : "http://localhost:4000";

const reservedUsernames = new Set([
  "admin",
  "support",
  "teacher",
  "student",
  "parent",
  "school",
  "techmandalae",
  "adhyay"
]);

export async function GET(request: NextRequest) {
  const username = sanitizeUsername(request.nextUrl.searchParams.get("username") ?? "");

  if (!username || username.length < 3) {
    return NextResponse.json({
      available: false,
      suggestions: buildUsernameSuggestions(username || "user")
    });
  }

  if (reservedUsernames.has(username)) {
    return NextResponse.json({
      available: false,
      suggestions: buildUsernameSuggestions(username)
    });
  }

  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    FALLBACK_API_BASE
  ).replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${apiBase}/auth/check-username?username=${encodeURIComponent(username)}`,
      {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(2000)
      }
    );

    if (response.ok) {
      const payload = (await response.json()) as {
        available?: boolean;
        suggestions?: string[];
      };

      return NextResponse.json({
        available: Boolean(payload.available),
        suggestions:
          payload.suggestions ??
          (payload.available ? [] : buildUsernameSuggestions(username))
      });
    }
  } catch {
    // Fall back to a lightweight optimistic check when the upstream route is unavailable.
  }

  return NextResponse.json({
    available: true,
    suggestions: []
  });
}
