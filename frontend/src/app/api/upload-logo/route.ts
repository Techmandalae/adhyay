// test change
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

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
  return headers;
}

function toPublicUrl(relativePath: string | null | undefined) {
  if (!relativePath) {
    return null;
  }

  if (/^https?:\/\//i.test(relativePath)) {
    return relativePath;
  }

  return `${API_BASE}/${relativePath.replace(/^\/+/, "")}`;
}

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 2MB)" },
        { status: 400 }
      );
    }

    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    const formData = new FormData();
    formData.append("logo", file, file.name || `logo-${Date.now()}.png`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/admin/logo`, {
        method: "POST",
        headers: getAuthHeader(request),
        body: formData,
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
      logoUrl?: string;
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload.error?.message ?? payload.message ?? "Upload failed"
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      logoUrl: payload.logoUrl ?? null,
      url: toPublicUrl(payload.logoUrl)
    });
  } catch (error) {
    console.error("Logo upload failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Upload timed out"
            : "Upload failed"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const response = await fetch(`${API_BASE}/admin/logo`, {
      method: "DELETE",
      headers: (() => {
        const headers = getAuthHeader(request);
        headers.set("Content-Type", "application/json");
        return headers;
      })()
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
      logoUrl?: string | null;
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload.error?.message ?? payload.message ?? "Logo removal failed"
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      logoUrl: payload.logoUrl ?? null,
      url: toPublicUrl(payload.logoUrl)
    });
  } catch (error) {
    console.error("Logo removal failed", error);
    return NextResponse.json({ error: "Logo removal failed" }, { status: 500 });
  }
}
