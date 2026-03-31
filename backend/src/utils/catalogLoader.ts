import fs from "fs";
import path from "path";

type SubjectSummary = {
  id: string;
  name: string;
};

type SubjectItem = {
  subject?: string;
  name?: string;
  books?: Array<{
    id?: string;
    book?: string;
    name?: string;
    chapters?: string[];
  }>;
};

type JsonRecord = Record<string, unknown>;

const basePath = path.join(process.cwd(), "src/data");
const ID_SEPARATOR = "::";

function normalizeSubjectId(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-");
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

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function extractSubjects(data: unknown): SubjectSummary[] {
  if (!data) {
    return [];
  }

  const record = asRecord(data);
  if (record && Array.isArray(record.subjects)) {
    return (record.subjects as SubjectItem[])
      .map((subject) => {
        const name = subject.name ?? subject.subject;
        if (!name) {
          return null;
        }

        return {
          id: normalizeSubjectId(name),
          name
        };
      })
      .filter((subject): subject is SubjectSummary => Boolean(subject));
  }

  if (Array.isArray(data)) {
    return (data as SubjectItem[])
      .map((subject) => {
        const name = subject.subject ?? subject.name;
        if (!name) {
          return null;
        }

        return {
          id: normalizeSubjectId(name),
          name
        };
      })
      .filter((subject): subject is SubjectSummary => Boolean(subject));
  }

  if (record) {
    return Object.keys(record).map((name) => ({
      id: normalizeSubjectId(name),
      name
    }));
  }

  return [];
}

function extractSubjectBooks(data: unknown, subjectId: string) {
  if (!data) {
    return [];
  }

  const record = asRecord(data);
  if (record && Array.isArray(record.subjects)) {
    const subject = (record.subjects as SubjectItem[]).find((item) => {
      const name = item.name ?? item.subject;
      return name ? normalizeSubjectId(name) === subjectId : false;
    });

    return subject?.books ?? [];
  }

  if (Array.isArray(data)) {
    const subject = (data as SubjectItem[]).find((item) => {
      const name = item.subject ?? item.name;
      return name ? normalizeSubjectId(name) === subjectId : false;
    });

    return subject?.books ?? [];
  }

  if (record) {
    const entry = Object.entries(record).find(
      ([name]) => normalizeSubjectId(name) === subjectId
    );

    if (entry && Array.isArray(entry[1])) {
      return (entry[1] as string[]).map((name) => ({
        book: undefined as string | undefined,
        name,
        chapters: [] as string[]
      }));
    }

    const subject = entry?.[1] as
      | {
          book?: string;
          books?: Array<{ book?: string; name?: string; chapters?: string[] }>;
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
      return [
        {
          book: subject.book,
          chapters: subject.chapters ?? []
        }
      ];
    }
  }

  return [];
}

export function loadClassData(classId: string) {
  const classNumber = parseDefaultClassId(classId);
  console.log("Loading JSON from:", basePath);
  console.log("ClassId:", classId);

  if (!classNumber) {
    return { classNumber: null, ncert: null, reference: null };
  }

  const ncertPath = path.join(basePath, "ncert", `class${classNumber}.json`);
  const referencePath = path.join(basePath, "reference", "reference.json");

  console.log("NCERT path:", ncertPath);
  console.log("Exists:", fs.existsSync(ncertPath));

  const ncert = readJsonFile(ncertPath);
  const reference = readJsonFile(referencePath);

  return { classNumber, ncert, reference };
}

export function buildFallbackSubjects(classId: string) {
  const { ncert, reference } = loadClassData(classId);
  const subjectMap = new Map<string, { id: string; name: string; classId: string }>();

  [...extractSubjects(ncert), ...extractSubjects(reference)].forEach((subject) => {
    subjectMap.set(subject.id, {
      id: `${classId}${ID_SEPARATOR}${subject.id}`,
      name: subject.name,
      classId
    });
  });

  const subjects = Array.from(subjectMap.values());
  console.log("Final subjects:", subjects);
  return subjects;
}

export function buildFallbackBooks(subjectId: string) {
  const [classId, subjectSlug] = subjectId.split(ID_SEPARATOR);
  if (!classId || !subjectSlug) {
    return { ncertBooks: [], referenceBooks: [] };
  }

  const { ncert, reference } = loadClassData(classId);
  const ncertBooks = extractSubjectBooks(ncert, subjectSlug).map((book, index) => ({
    id: `${classId}${ID_SEPARATOR}${subjectSlug}${ID_SEPARATOR}ncert${ID_SEPARATOR}${index}`,
    name: book.book ?? book.name ?? `Book ${index + 1}`,
    type: "NCERT" as const,
    subjectId
  }));

  const referenceBooks = extractSubjectBooks(reference, subjectSlug).map((book, index) => ({
    id: `${classId}${ID_SEPARATOR}${subjectSlug}${ID_SEPARATOR}reference${ID_SEPARATOR}${index}`,
    name: book.book ?? book.name ?? `Reference ${index + 1}`,
    type: "REFERENCE" as const,
    subjectId
  }));

  return { ncertBooks, referenceBooks };
}

export function buildFallbackChaptersFromContext(
  classId: string,
  subjectId: string,
  bookId: string
) {
  const normalizedSubjectId = subjectId.includes(ID_SEPARATOR)
    ? subjectId.split(ID_SEPARATOR)[1] ?? ""
    : subjectId;
  const { ncert, reference } = loadClassData(classId);

  const candidates = [
    ...extractSubjectBooks(ncert, normalizedSubjectId).map((book, index) => ({
      sourceType: "ncert",
      index,
      name: book.book ?? book.name ?? "",
      chapters: Array.isArray(book.chapters) ? book.chapters : []
    })),
    ...extractSubjectBooks(reference, normalizedSubjectId).map((book, index) => ({
      sourceType: "reference",
      index,
      name: book.book ?? book.name ?? "",
      chapters: Array.isArray(book.chapters) ? book.chapters : []
    }))
  ];

  const matchedBook = candidates.find((book) => {
    const generatedId = `${classId}${ID_SEPARATOR}${normalizedSubjectId}${ID_SEPARATOR}${book.sourceType}${ID_SEPARATOR}${book.index}`;
    return (
      generatedId === bookId ||
      normalizeSubjectId(book.name) === bookId ||
      book.name === bookId
    );
  });

  if (!matchedBook) {
    return {
      subjectId: subjectId.includes(ID_SEPARATOR)
        ? subjectId
        : `${classId}${ID_SEPARATOR}${normalizedSubjectId}`,
      bookName: "",
      items: []
    };
  }

  return {
    subjectId: subjectId.includes(ID_SEPARATOR)
      ? subjectId
      : `${classId}${ID_SEPARATOR}${normalizedSubjectId}`,
    bookName: matchedBook.name,
    items: matchedBook.chapters.map((title, chapterIndex) => ({
      id: `${bookId}${ID_SEPARATOR}chapter${ID_SEPARATOR}${chapterIndex}`,
      title,
      bookId
    }))
  };
}

export function buildFallbackChapters(bookId: string) {
  const [classId, subjectSlug, sourceType, rawIndex] = bookId.split(ID_SEPARATOR);
  if (!classId || !subjectSlug || !sourceType || rawIndex === undefined) {
    return { subjectId: "", bookName: "", items: [] };
  }

  const { ncert, reference } = loadClassData(classId);
  const sourceBooks =
    sourceType === "reference"
      ? extractSubjectBooks(reference, subjectSlug)
      : extractSubjectBooks(ncert, subjectSlug);

  const index = Number(rawIndex);
  if (!Number.isFinite(index)) {
    return { subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`, bookName: "", items: [] };
  }

  const book = sourceBooks[index];
  if (!book) {
    return { subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`, bookName: "", items: [] };
  }

  const bookName = book.book ?? book.name ?? "";
  const chapters = Array.isArray(book.chapters) ? book.chapters : [];

  return {
    subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`,
    bookName,
    items: chapters.map((title, chapterIndex) => ({
      id: `${bookId}${ID_SEPARATOR}chapter${ID_SEPARATOR}${chapterIndex}`,
      title,
      bookId
    }))
  };
}
