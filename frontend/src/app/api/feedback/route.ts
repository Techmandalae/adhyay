import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (
  process.env.API_BASE_URL ??
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://api.adhyay.techmandalae.com"
    : "http://localhost:4000")
).replace(/\/+$/, "");

function getAuthHeader(request: NextRequest) {
  const header = request.headers.get("authorization");
  const headers = new Headers();
  if (header) {
    headers.set("Authorization", header);
  }
  headers.set("Content-Type", "application/json");
  return headers;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: getAuthHeader(request),
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
      message?: string;
      success?: boolean;
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            (typeof payload.error === "object"
              ? payload.error?.message
              : payload.error) ??
            payload.message ??
            "Failed"
        },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback submission failed", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
