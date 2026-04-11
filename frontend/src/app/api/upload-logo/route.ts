import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

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
  const headers = new Headers();

  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");

  if (authorization) {
    headers.set("Authorization", authorization);
  }
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  if (contentLength) {
    headers.set("Content-Length", contentLength);
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

async function parseJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as {
      error?: { message?: string };
      message?: string;
      success?: boolean;
      url?: string | null;
      logoUrl?: string | null;
    };
  } catch {
    return null;
  }
}

function parseUploadSize(request: NextRequest) {
  const rawSize =
    request.headers.get("x-logo-size") ??
    request.headers.get("x-file-size") ??
    request.headers.get("content-length");

  if (!rawSize) {
    return null;
  }

  const size = Number(rawSize);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

function parseUploadType(request: NextRequest) {
  const type = request.headers.get("x-logo-type") ?? request.headers.get("x-file-type");
  return type?.trim().toLowerCase() ?? "";
}

export async function POST(request: NextRequest) {
  try {
    const requestContentType = request.headers.get("content-type") ?? "";
    if (!requestContentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const uploadSize = parseUploadSize(request);
    if (uploadSize === null) {
      return NextResponse.json({ error: "Missing file size" }, { status: 400 });
    }

    if (uploadSize > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 2MB)" },
        { status: 400 }
      );
    }

    const uploadType = parseUploadType(request);
    if (!uploadType || !ALLOWED_LOGO_TYPES.has(uploadType)) {
      return NextResponse.json(
        { error: "Only PNG, JPEG, and WEBP logos are allowed" },
        { status: 400 }
      );
    }

    if (!request.body) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      const init: RequestInit & { duplex: "half" } = {
        method: "POST",
        headers: getAuthHeader(request),
        body: request.body,
        cache: "no-store",
        signal: controller.signal,
        duplex: "half"
      };

      response = await fetch(`${API_BASE}/admin/logo`, {
        ...init
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await parseJsonSafely(response);
    const relativeUrl = payload?.url ?? payload?.logoUrl ?? null;
    const publicUrl = toPublicUrl(relativeUrl);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload?.error?.message ?? payload?.message ?? "Upload failed"
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      logoUrl: publicUrl,
      path: relativeUrl,
      url: publicUrl
    });
  } catch (error) {
    console.error("Logo upload failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Upload timed out"
            : error instanceof Error && error.name === "TypeError"
              ? "Upload upstream unavailable"
              : "Upload failed"
      },
      {
        status:
          error instanceof Error && error.name === "TypeError"
            ? 502
            : 500
      }
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
