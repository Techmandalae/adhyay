import { Router, Request, Response, NextFunction } from "express";

import { prisma } from "../db/prisma";
import { requireAuth, requireTeacherOrAdmin } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { getString } from "../utils/query";

/* ======================================================
   PRISMA CLIENT (shared)
====================================================== */

/* ======================================================
   ROUTER INIT
====================================================== */

const router = Router();
export const catalogRouter = Router();

/* ======================================================
   AUTH MIDDLEWARE
====================================================== */

router.use(requireAuth);
router.use(requireTeacherOrAdmin);

catalogRouter.use(requireAuth);
catalogRouter.use(requireTeacherOrAdmin);

const STREAM_SUBJECTS: Record<string, string[]> = {
  Science: ["Physics", "Chemistry", "Mathematics", "Biology"],
  Commerce: ["Accountancy", "Business Studies", "Economics"],
  Arts: ["Political Science", "History", "Geography"]
};

const DEFAULT_CLASSES = [
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12"
];

const COMMON_SUBJECTS = ["Mathematics", "Science", "Social Science", "English", "Hindi"];

function buildSubjectPool(hasStreams: boolean, sections: { name: string }[]) {
  if (!hasStreams) {
    return COMMON_SUBJECTS;
  }
  const pool = new Set<string>();
  sections.forEach((section) => {
    const subjects = STREAM_SUBJECTS[section.name] ?? [];
    subjects.forEach((subject) => pool.add(subject));
  });
  return Array.from(pool);
}

function parseClassLevel(name: string): number | null {
  const match = name.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function splitBooksByType(books: Array<{ id: string; name: string; type: "NCERT" | "REFERENCE"; subjectId: string }>) {
  return {
    ncertBooks: books.filter((book) => book.type === "NCERT"),
    referenceBooks: books.filter((book) => book.type === "REFERENCE")
  };
}

async function getClassSubjectsWithBooks(classId: string, schoolId: string, expectedSubjects: string[]) {
  const subjects = await prisma.academicSubject.findMany({
    where: { classId, schoolId },
    orderBy: { name: "asc" },
    include: {
      books: {
        orderBy: { name: "asc" },
        include: {
          chapters: { orderBy: { title: "asc" }, select: { id: true, title: true, bookId: true } }
        }
      }
    }
  });

  if (subjects.length > 0) {
    return subjects;
  }

  if (expectedSubjects.length === 0) {
    return [];
  }

  return expectedSubjects.map((name) => ({
    id: `virtual-${classId}-${name}`,
    name,
    books: []
  }));
}

function buildDefaultCatalogResponse() {
  return {
    classes: DEFAULT_CLASSES.map((name, index) => ({
      id: `default-${index + 1}`,
      name
    })),
    subjects: [],
    books: [],
    chapters: []
  };
}

/* ======================================================
   GET /academic/classes
====================================================== */

router.get(
  "/classes",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const user = _req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      if (!user.schoolId) {
        console.log("Using default classes for independent user");
        const items = DEFAULT_CLASSES.map((name, index) => ({
          id: `default-${index + 1}`,
          name,
          label: name,
          classId: `default-${index + 1}`,
          classLevel: index + 1,
          sectionId: null,
          sectionName: null,
          classStandardId: null,
          className: name
        }));

        return res.json({ items });
      }

      const classRecords = await prisma.academicClass.findMany({
        where: { schoolId: user.schoolId },
        select: {
          id: true,
          classLevel: true,
          classStandardId: true
        }
      });
      const classByStandard = new Map(
        classRecords
          .filter((klass) => Boolean(klass.classStandardId))
          .map((klass) => [klass.classStandardId as string, klass])
      );

      const standards = await prisma.academicClassStandard.findMany({
        where: {
          schoolId: user.schoolId,
          ...(classByStandard.size > 0 ? { id: { in: Array.from(classByStandard.keys()) } } : {})
        },
        orderBy: { name: "asc" },
        include: {
          sections: { orderBy: { name: "asc" }, select: { id: true, name: true } }
        }
      });

      const items = standards.flatMap((standard) => {
        const klass = classByStandard.get(standard.id);
        if (!klass) return [];
        return standard.sections.map((section) => {
          const suffix = /^[A-Z]$/.test(section.name) ? section.name : ` ${section.name}`;
          return {
            id: section.id,
            label: `${standard.name}${suffix}`,
            classId: klass.id,
            classLevel: klass.classLevel,
            sectionId: section.id,
            sectionName: section.name,
            classStandardId: standard.id,
            className: standard.name
          };
        });
      });

      res.json({ items });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   GET /academic/sections
====================================================== */

router.get("/sections", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    const sections = await prisma.academicSection.findMany({
      where: { schoolId: user.schoolId },
      include: {
        classStandard: true
      }
    });

    const classRecords = await prisma.academicClass.findMany({
      where: { schoolId: user.schoolId },
      select: { id: true, classStandardId: true, classLevel: true }
    });
    const classByStandard = new Map(
      classRecords
        .filter((klass) => Boolean(klass.classStandardId))
        .map((klass) => [klass.classStandardId as string, klass])
    );

    const items = sections
      .map((section) => {
      const standardName = section.classStandard?.name ?? "Class";
      const level = parseClassLevel(standardName);
      const suffix = /^[A-Z]$/.test(section.name) ? section.name : ` ${section.name}`;
      const label = level !== null ? `Class ${level}${suffix}` : `${standardName}${suffix}`;
      const klass = classByStandard.get(section.classStandardId);
      return {
        id: section.id,
        label,
        classId: klass?.id ?? null,
        classLevel: klass?.classLevel ?? null,
        sectionId: section.id,
        classStandardId: section.classStandardId
      };
    })
      .sort((a, b) => {
        const aLevel = a.classLevel ?? Number.MAX_SAFE_INTEGER;
        const bLevel = b.classLevel ?? Number.MAX_SAFE_INTEGER;
        if (aLevel !== bLevel) return aLevel - bLevel;
        return a.label.localeCompare(b.label);
      });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

/* ======================================================
   GET /academic/subjects/:classId
====================================================== */

router.get(
  "/subjects/:classId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const classId = getString(req.params.classId);
      if (!classId) {
        return res.status(400).json({ error: "classId required" });
      }

      console.log("ClassId:", classId);

      const classRecord = await prisma.academicClass.findFirst({
        where: { id: classId, schoolId: user.schoolId },
        select: { id: true, classStandardId: true }
      });

      if (!classRecord) {
        return next(new HttpError(404, "Class not found"));
      }

      const subjects = await prisma.academicSubject.findMany({
        where: {
          classId: classRecord.id,
          schoolId: user.schoolId
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, classId: true }
      });

      console.log("Subjects:", subjects);
      if (subjects.length === 0) {
        console.log("No subjects found for class:", classId);
      }

      res.json({ items: subjects });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   GET /academic/books/:subjectId
====================================================== */

router.get(
  "/books/:subjectId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const subjectId = getString(req.params.subjectId);
      if (!subjectId) {
        return res.status(400).json({ error: "subjectId required" });
      }

      const subject = await prisma.academicSubject.findFirst({
        where: { id: subjectId, schoolId: user.schoolId },
        select: { id: true, classId: true }
      });

      if (!subject) {
        return next(new HttpError(404, "Subject not found"));
      }

      const books = await prisma.academicBook.findMany({
        where: { subjectId, schoolId: user.schoolId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, subjectId: true }
      });

      res.json({
        ncertBooks: books.filter((book) => book.type === "NCERT"),
        referenceBooks: books.filter((book) => book.type === "REFERENCE")
      });
    } catch (error) {
      next(error);
    }
  }
);

catalogRouter.get("/teacher/catalog", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, "Authentication required"));
    }

    if (!user.schoolId) {
      console.log("Using default catalog for independent teacher");
      return res.json(buildDefaultCatalogResponse());
    }

    const standards = await prisma.academicClassStandard.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { name: "asc" },
      include: {
        sections: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        classes: { select: { id: true, name: true, classLevel: true }, orderBy: { classLevel: "asc" } }
      }
    });

    if (standards.length === 0) {
      console.log("No classes found -> using default fallback");
      return res.json(buildDefaultCatalogResponse());
    }

    const items = [];

    for (const standard of standards) {
      const classRecord = standard.classes[0];
      const expectedSubjects = buildSubjectPool(standard.hasStreams, standard.sections);
      const subjects = classRecord
        ? await getClassSubjectsWithBooks(classRecord.id, user.schoolId, expectedSubjects)
        : [];

      items.push({
        classId: classRecord?.id ?? standard.id,
        className: standard.name,
        classLevel: classRecord?.classLevel ?? null,
        sections: standard.sections.map((section) => ({
          id: section.id,
          name: section.name
        })),
        subjects: subjects.map((subject) => ({
          subjectId: subject.id,
          name: subject.name,
          books: (subject.books ?? []).map((book: any) => ({
            id: book.id,
            name: book.name,
            type: book.type,
            chapters: (book.chapters ?? []).map((chapter: any) => ({
              id: chapter.id,
              name: chapter.title
            }))
          }))
        }))
      });
    }

    if (items.length === 0) {
      console.log("No classes found -> using default fallback");
      return res.json(buildDefaultCatalogResponse());
    }

    res.json(items);
  } catch (error) {
    next(error);
  }
});

/* ======================================================
   GET /academic/subjects?classId=
====================================================== */

router.get(
  "/subjects",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classId } = req.query;

      if (!classId || typeof classId !== "string") {
        return next(new HttpError(400, "classId is required"));
      }

      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const subjects = await prisma.academicSubject.findMany({
        where: { classId, schoolId: user.schoolId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          classId: true
        },
      });

      res.json({ items: subjects });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   GET /academic/books?subjectId=
====================================================== */

router.get(
  "/books",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subjectId } = req.query;

      if (!subjectId || typeof subjectId !== "string") {
        return next(new HttpError(400, "subjectId is required"));
      }

      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const classId = req.query.classId;
      if (!classId || typeof classId !== "string") {
        return next(new HttpError(400, "classId is required"));
      }

      const subject = await prisma.academicSubject.findFirst({
        where: { id: subjectId, classId, schoolId: user.schoolId },
        select: { id: true }
      });

      if (!subject) {
        return next(new HttpError(404, "Subject not found for class"));
      }

      const books = await prisma.academicBook.findMany({
        where: { subjectId, schoolId: user.schoolId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          subjectId: true
        },
      });

      res.json({
        ...splitBooksByType(books),
        items: books
      });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   GET /academic/chapters/:bookId
====================================================== */

router.get(
  "/chapters/:bookId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const bookId = getString(req.params.bookId);
      if (!bookId) {
        return res.status(400).json({ error: "bookId required" });
      }

      const book = await prisma.academicBook.findFirst({
        where: { id: bookId, schoolId: user.schoolId },
        select: {
          id: true,
          name: true,
          subjectId: true,
          subject: { select: { classId: true } }
        }
      });

      if (!book) {
        return next(new HttpError(404, "Book not found"));
      }

      const chapters = await prisma.academicChapter.findMany({
        where: { bookId, schoolId: user.schoolId },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          bookId: true
        },
      });

      res.json({ subjectId: book.subjectId, bookName: book.name, items: chapters });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   GET /academic/chapters?bookId=
====================================================== */

router.get(
  "/chapters",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { bookId } = req.query;

      if (!bookId || typeof bookId !== "string") {
        return next(new HttpError(400, "bookId is required"));
      }

      const user = req.user;
      if (!user) {
        return next(new HttpError(401, "Authentication required"));
      }

      const book = await prisma.academicBook.findFirst({
        where: { id: bookId, schoolId: user.schoolId },
        select: {
          id: true,
          name: true,
          subjectId: true,
          subject: { select: { classId: true } }
        }
      });

      if (!book) {
        return next(new HttpError(404, "Book not found"));
      }

      const chapters = await prisma.academicChapter.findMany({
        where: { bookId, schoolId: user.schoolId },
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          bookId: true
        },
      });

      res.json({ subjectId: book.subjectId, bookName: book.name, items: chapters });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   EXPORT
====================================================== */

export default router;
