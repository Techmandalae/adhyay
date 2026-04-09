import { NextRequest, NextResponse } from "next/server";

const API_BASE = (
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
  const incoming = await request.formData();
  const file = incoming.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const formData = new FormData();
  formData.append("logo", file);

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/admin/logo`, {
      method: "POST",
      headers: getAuthHeader(request),
      body: formData
    });
  } catch {
    return NextResponse.json(
      {
        error: "Logo upload service is unavailable. Please try again."
      },
      { status: 502 }
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    logoUrl?: string;
  };

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          payload.error?.message ??
          payload.message ??
          `Request failed with status ${response.status}`
      },
      { status: response.status }
    );
  }

  return NextResponse.json({
    logoUrl: payload.logoUrl ?? null,
    url: toPublicUrl(payload.logoUrl)
  });
}

export async function DELETE(request: NextRequest) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/admin/logo`, {
      method: "DELETE",
      headers: (() => {
        const headers = getAuthHeader(request);
        headers.set("Content-Type", "application/json");
        return headers;
      })()
    });
  } catch {
    return NextResponse.json(
      {
        error: "Logo removal service is unavailable. Please try again."
      },
      { status: 502 }
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    logoUrl?: string | null;
  };

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          payload.error?.message ??
          payload.message ??
          `Request failed with status ${response.status}`
      },
      { status: response.status }
    );
  }

  return NextResponse.json({
    logoUrl: payload.logoUrl ?? null,
    url: toPublicUrl(payload.logoUrl)
  });
}
