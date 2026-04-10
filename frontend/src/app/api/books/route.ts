import fs from "node:fs";
import path from "node:path";

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

const DATA_PATH = path.join(process.cwd(), "..", "backend", "src", "data");
const ID_SEPARATOR = "::";

type BookRecord = {
  book?: string;
  name?: string;
  chapters?: string[];
};

type JsonRecord = Record<string, unknown>;

function getAuthHeaders(request: NextRequest) {
  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) {
    headers.set("Authorization", auth);
  }
  headers.set("Content-Type", "application/json");
  return headers;
}

function parseDefaultClassId(classId: string) {
  if (!classId.startsWith("default-")) {
    return null;
  }

  const classNumber = classId.replace("default-", "");
  return /^\d+$/.test(classNumber) ? classNumber : null;
}

function readJsonFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
}

function readFirstExistingJsonFile(filePaths: string[]) {
  for (const filePath of filePaths) {
    if (fs.existsSync(filePath)) {
      return readJsonFile(filePath);
    }
  }

  return null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function normalizeSubjectId(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function loadClassData(classId: string) {
  const classNumber = parseDefaultClassId(classId);
  if (!classNumber) {
    return { ncert: null, reference: null };
  }

  const ncert = readFirstExistingJsonFile([
    path.join(DATA_PATH, "ncert", `class-${classNumber}.json`),
    path.join(DATA_PATH, "ncert", `class${classNumber}.json`)
  ]);
  const reference = readFirstExistingJsonFile([
    path.join(DATA_PATH, "reference", `class-${classNumber}.json`),
    path.join(DATA_PATH, "reference", `class${classNumber}.json`),
    path.join(DATA_PATH, "reference", "reference.json")
  ]);

  return { ncert, reference };
}

function extractSubjectBooks(data: unknown, subjectSlug: string): BookRecord[] {
  if (!data) {
    return [];
  }

  const record = asRecord(data);
  if (!record) {
    return [];
  }

  const directEntry = Object.entries(record).find(
    ([name]) => normalizeSubjectId(name) === subjectSlug
  );

  if (!directEntry) {
    return [];
  }

  if (Array.isArray(directEntry[1])) {
    return (directEntry[1] as string[]).map((name) => ({ name, chapters: [] }));
  }

  const subject = directEntry[1] as
    | {
        book?: string;
        books?: BookRecord[];
        chapters?: string[];
      }
    | undefined;

  if (!subject) {
    return [];
  }

  if (Array.isArray(subject.books) && subject.books.length > 0) {
    return subject.books;
  }

  if (subject.book) {
    return [{ book: subject.book, chapters: subject.chapters ?? [] }];
  }

  return [];
}

function buildFallbackBooks(subjectId: string) {
  const [classId, subjectSlug] = subjectId.split(ID_SEPARATOR);
  if (!classId || !subjectSlug) {
    return { ncertBooks: [], referenceBooks: [] };
  }

  const { ncert, reference } = loadClassData(classId);

  return {
    ncertBooks: extractSubjectBooks(ncert, subjectSlug).map((book, index) => ({
      id: `${classId}${ID_SEPARATOR}${subjectSlug}${ID_SEPARATOR}ncert${ID_SEPARATOR}${index}`,
      name: book.book ?? book.name ?? `Book ${index + 1}`,
      type: "NCERT" as const,
      subjectId
    })),
    referenceBooks: extractSubjectBooks(reference, subjectSlug).map((book, index) => ({
      id: `${classId}${ID_SEPARATOR}${subjectSlug}${ID_SEPARATOR}reference${ID_SEPARATOR}${index}`,
      name: book.book ?? book.name ?? `Reference ${index + 1}`,
      type: "REFERENCE" as const,
      subjectId
    }))
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const subjectId = searchParams.get("subjectId");

    if (!classId || !subjectId) {
      return NextResponse.json(
        { error: "classId and subjectId are required" },
        { status: 400 }
      );
    }

    const fallbackSubjectId =
      subjectId.includes(ID_SEPARATOR)
        ? subjectId
        : classId.startsWith("default-")
          ? `${classId}${ID_SEPARATOR}${subjectId}`
          : null;

    if (fallbackSubjectId) {
      return NextResponse.json(buildFallbackBooks(fallbackSubjectId));
    }

    const response = await fetch(
      `${API_BASE}/academic/books?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}`,
      {
        method: "GET",
        headers: getAuthHeaders(request),
        cache: "no-store"
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
      message?: string;
      ncertBooks?: unknown[];
      referenceBooks?: unknown[];
      items?: unknown[];
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            (typeof payload.error === "object"
              ? payload.error?.message
              : payload.error) ??
            payload.message ??
            "Failed to fetch books"
        },
        { status: response.status }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Books fetch failed", error);
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    );
  }
}
