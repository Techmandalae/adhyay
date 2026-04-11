import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_ANSWER_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ANSWER_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
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

function getForwardHeaders(request: NextRequest) {
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

async function parseJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as {
      error?: { message?: string };
      message?: string;
      submissionId?: string;
      evaluationId?: string;
      status?: string;
      score?: number;
      fileUrl?: string;
    };
  } catch {
    return null;
  }
}

function parseUploadSize(request: NextRequest) {
  const rawSize =
    request.headers.get("x-answer-size") ??
    request.headers.get("x-file-size") ??
    request.headers.get("content-length");

  if (!rawSize) {
    return null;
  }

  const size = Number(rawSize);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

function parseUploadType(request: NextRequest) {
  return (
    request.headers.get("x-answer-type") ??
    request.headers.get("x-file-type") ??
    ""
  )
    .trim()
    .toLowerCase();
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
    if (uploadSize > MAX_ANSWER_SIZE_BYTES) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const uploadType = parseUploadType(request);
    if (!ALLOWED_ANSWER_TYPES.has(uploadType)) {
      return NextResponse.json({ error: "Only PDF or images allowed" }, { status: 400 });
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
        headers: getForwardHeaders(request),
        body: request.body,
        cache: "no-store",
        signal: controller.signal,
        duplex: "half"
      };

      response = await fetch(`${API_BASE}/submit-answer`, init);
    } finally {
      clearTimeout(timeout);
    }

    const payload = await parseJsonSafely(response);

    if (!response.ok) {
      return NextResponse.json(
        {
          error: payload?.error?.message ?? payload?.message ?? "Answer upload failed"
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: payload?.message ?? "Answer sheet uploaded",
      submissionId: payload?.submissionId ?? null,
      evaluationId: payload?.evaluationId ?? null,
      status: payload?.status ?? null,
      score: payload?.score,
      fileUrl: payload?.fileUrl ?? null
    });
  } catch (error) {
    console.error("Student answer upload failed", error);
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
