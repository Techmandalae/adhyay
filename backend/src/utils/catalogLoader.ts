import fs from "fs";
import path from "path";

type NcertBookRecord = {
  book?: string;
  name?: string;
  chapters?: string[];
};

type NcertSubjectRecord = {
  book?: string;
  books?: NcertBookRecord[];
  chapters?: string[];
};

type NcertData = Record<string, NcertSubjectRecord>;
type ReferenceData = Record<string, string[]>;

const basePath = path.join(__dirname, "../data");
const ID_SEPARATOR = "::";

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

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

function getSubjectEntry(data: NcertData | ReferenceData | null, subjectId: string) {
  if (!data) {
    return null;
  }

  const entry = Object.entries(data).find(([name]) => normalizeSubjectId(name) === subjectId);
  return entry ?? null;
}

function getNcertBooksForSubject(subjectId: string, ncert: NcertData | null) {
  const entry = getSubjectEntry(ncert, subjectId);
  if (!entry) {
    return [];
  }

  const [, subject] = entry as [string, NcertSubjectRecord];

  if (Array.isArray(subject.books) && subject.books.length > 0) {
    return subject.books.map((book, index) => ({
      index,
      name: book.book ?? book.name ?? `Book ${index + 1}`,
      chapters: book.chapters ?? []
    }));
  }

  if (subject.book) {
    return [
      {
        index: 0,
        name: subject.book,
        chapters: subject.chapters ?? []
      }
    ];
  }

  return [];
}

export function loadClassData(classId: string) {
  const classNumber = parseDefaultClassId(classId);

  if (!classNumber) {
    return { classNumber: null, ncert: null, reference: null };
  }

  const ncertPath = path.join(basePath, "ncert", `class${classNumber}.json`);
  const referencePath = path.join(basePath, "reference", "reference.json");

  const ncert = readJsonFile<NcertData>(ncertPath);
  const reference = readJsonFile<ReferenceData>(referencePath);

  return { classNumber, ncert, reference };
}

export function buildFallbackSubjects(classId: string) {
  const { ncert, reference } = loadClassData(classId);
  const items = new Map<string, { id: string; name: string; classId: string }>();

  if (ncert) {
    Object.keys(ncert).forEach((name) => {
      const slug = normalizeSubjectId(name);
      items.set(slug, {
        id: `${classId}${ID_SEPARATOR}${slug}`,
        name,
        classId
      });
    });
  }

  if (items.size === 0 && reference) {
    Object.keys(reference).forEach((name) => {
      const slug = normalizeSubjectId(name);
      items.set(slug, {
        id: `${classId}${ID_SEPARATOR}${slug}`,
        name,
        classId
      });
    });
  }

  return Array.from(items.values());
}

export function buildFallbackBooks(subjectId: string) {
  const [classId, subjectSlug] = subjectId.split(ID_SEPARATOR);
  if (!classId || !subjectSlug) {
    return { ncertBooks: [], referenceBooks: [] };
  }

  const { ncert, reference } = loadClassData(classId);
  const ncertBooks = getNcertBooksForSubject(subjectSlug, ncert).map((book) => ({
    id: `${classId}${ID_SEPARATOR}${subjectSlug}${ID_SEPARATOR}ncert${ID_SEPARATOR}${book.index}`,
    name: book.name,
    type: "NCERT" as const,
    subjectId
  }));

  const referenceEntry = getSubjectEntry(reference, subjectSlug);
  const referenceBooks =
    referenceEntry?.[1].map((name: string, index: number) => ({
      id: `${classId}${ID_SEPARATOR}${subjectSlug}${ID_SEPARATOR}reference${ID_SEPARATOR}${index}`,
      name,
      type: "REFERENCE" as const,
      subjectId
    })) ?? [];

  return { ncertBooks, referenceBooks };
}

export function buildFallbackChapters(bookId: string) {
  const [classId, subjectSlug, sourceType, rawIndex] = bookId.split(ID_SEPARATOR);
  if (!classId || !subjectSlug || !sourceType || rawIndex === undefined) {
    return { subjectId: "", bookName: "", items: [] };
  }

  const { ncert } = loadClassData(classId);
  if (sourceType !== "ncert") {
    return {
      subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`,
      bookName: "",
      items: []
    };
  }

  const index = Number(rawIndex);
  if (!Number.isFinite(index)) {
    return {
      subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`,
      bookName: "",
      items: []
    };
  }

  const book = getNcertBooksForSubject(subjectSlug, ncert)[index];
  if (!book) {
    return {
      subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`,
      bookName: "",
      items: []
    };
  }

  return {
    subjectId: `${classId}${ID_SEPARATOR}${subjectSlug}`,
    bookName: book.name,
    items: book.chapters.map((title, chapterIndex) => ({
      id: `${bookId}${ID_SEPARATOR}chapter${ID_SEPARATOR}${chapterIndex}`,
      title,
      bookId
    }))
  };
}
