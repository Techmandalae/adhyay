import { Router, Request, Response, NextFunction } from "express";

import { prisma } from "../db/prisma";
import { requireAuth, requireTeacherOrAdmin } from "../middleware/auth";
import { HttpError } from "../middleware/error";
import { getString } from "../utils/query";
import {
  buildFallbackBooks,
  buildFallbackChapters,
  buildFallbackChaptersFromContext,
  buildFallbackSubjects
} from "../utils/catalogLoader";

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

function compareClassNames(left: string, right: string) {
  const leftLevel = parseClassLevel(left);
  const rightLevel = parseClassLevel(right);

  if (leftLevel !== null && rightLevel !== null && leftLevel !== rightLevel) {
    return leftLevel - rightLevel;
  }

  if (leftLevel !== null && rightLevel === null) {
    return -1;
  }

  if (leftLevel === null && rightLevel !== null) {
    return 1;
  }

  return left.localeCompare(right);
}

function buildFallbackClassId(classLevel: number | null | undefined) {
  return classLevel && Number.isFinite(classLevel) ? `default-${classLevel}` : null;
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
    select: {
      id: true,
      name: true,
      books: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          subjectId: true,
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
      select: {
        id: true,
        name: true,
        classStandardId: true,
        classStandard: {
          select: {
            name: true
          }
        }
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
      const isIndependent = classId.startsWith("default-");

      console.log("ClassId:", classId);

      if (classId.startsWith("default-")) {
        let subjects = await prisma.academicSubject.findMany({
          ...(user.schoolId ? { where: { schoolId: user.schoolId } } : {}),
          orderBy: { name: "asc" },
          select: { id: true, name: true, classId: true }
        });

        if (subjects.length === 0 && isIndependent) {
          console.log("Fallback -> loading subjects from JSON");
          subjects = buildFallbackSubjects(classId);
        }

        console.log("Subjects:", subjects);
        if (subjects.length === 0) {
          console.log("No subjects found for default class:", classId);
        }

        return res.json({ items: subjects });
      }

      const classRecord = await prisma.academicClass.findFirst({
        where: { id: classId, schoolId: user.schoolId },
        select: { id: true, classStandardId: true, classLevel: true, name: true }
      });

      if (!classRecord) {
        return next(new HttpError(404, "Class not found"));
      }

      if (user.role === "TEACHER") {
        const fallbackClassId =
          buildFallbackClassId(classRecord.classLevel) ??
          buildFallbackClassId(parseClassLevel(classRecord.name));

        if (fallbackClassId) {
          return res.json({
            items: buildFallbackSubjects(fallbackClassId).map((subject) => ({
              ...subject,
              classId: classRecord.id
            }))
          });
        }
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
        const fallbackClassId =
          buildFallbackClassId(classRecord.classLevel) ??
          buildFallbackClassId(parseClassLevel(classRecord.name));

        if (fallbackClassId) {
          return res.json({
            items: buildFallbackSubjects(fallbackClassId).map((subject) => ({
              ...subject,
              classId: classRecord.id
            }))
          });
        }

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
      const isIndependent = subjectId.includes("::") || subjectId.startsWith("default-");

      if (user.role === "TEACHER" && isIndependent) {
        const fallback = buildFallbackBooks(subjectId);
        return res.json({
          ncertBooks: fallback.ncertBooks,
          referenceBooks: fallback.referenceBooks
        });
      }

      const subject = user.schoolId
        ? await prisma.academicSubject.findFirst({
            where: { id: subjectId, schoolId: user.schoolId },
            select: { id: true, classId: true }
          })
        : null;

      if (user.schoolId && !subject) {
        return next(new HttpError(404, "Subject not found"));
      }

      const books = user.schoolId
        ? await prisma.academicBook.findMany({
            where: { subjectId, schoolId: user.schoolId },
            orderBy: { name: "asc" },
            select: { id: true, name: true, type: true, subjectId: true }
          })
        : [];

      if (books.length === 0 && isIndependent) {
        console.log("Fallback -> loading books from JSON");
        const fallback = buildFallbackBooks(subjectId);
        return res.json({
          ncertBooks: fallback.ncertBooks,
          referenceBooks: fallback.referenceBooks
        });
      }

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
      return res.json(buildDefaultCatalogResponse());
    }

    const standards = await prisma.academicClassStandard.findMany({
      where: { schoolId: user.schoolId },
      include: {
        sections: {
          orderBy: { name: "asc" },
          select: { id: true, name: true }
        },
        classes: {
          select: { id: true, classLevel: true, name: true }
        }
      }
    });

    if (standards.length === 0) {
      return res.json([]);
    }

    return res.json(
      [...standards]
        .sort((left, right) => compareClassNames(left.name, right.name))
        .map((standard) => {
          const linkedClass = [...standard.classes].sort((left, right) => {
            if (left.classLevel !== right.classLevel) {
              return left.classLevel - right.classLevel;
            }

            return compareClassNames(left.name, right.name);
          })[0];

          return {
            classId: linkedClass?.id ?? standard.id,
            className: standard.name,
            classLevel: linkedClass?.classLevel ?? parseClassLevel(standard.name),
            sections: standard.sections,
            subjects: []
          };
        })
    );
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

      if (user.role === "TEACHER" && !classId.startsWith("default-")) {
        const classRecord = await prisma.academicClass.findFirst({
          where: { id: classId, schoolId: user.schoolId },
          select: { id: true, classLevel: true, name: true }
        });

        const fallbackClassId = classRecord
          ? buildFallbackClassId(classRecord.classLevel) ??
            buildFallbackClassId(parseClassLevel(classRecord.name))
          : null;

        if (fallbackClassId && classRecord) {
          return res.json({
            items: buildFallbackSubjects(fallbackClassId).map((subject) => ({
              ...subject,
              classId: classRecord.id
            }))
          });
        }
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

      if (subjects.length === 0 && !classId.startsWith("default-")) {
        const classRecord = await prisma.academicClass.findFirst({
          where: { id: classId, schoolId: user.schoolId },
          select: { id: true, classLevel: true, name: true }
        });

        const fallbackClassId = classRecord
          ? buildFallbackClassId(classRecord.classLevel) ??
            buildFallbackClassId(parseClassLevel(classRecord.name))
          : null;

        if (fallbackClassId && classRecord) {
          return res.json({
            items: buildFallbackSubjects(fallbackClassId).map((subject) => ({
              ...subject,
              classId: classRecord.id
            }))
          });
        }
      }

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
      const isIndependent =
        classId.startsWith("default-") || subjectId.includes("::");
      const resolvedSubjectId =
        subjectId.includes("::")
          ? subjectId
          : isIndependent
            ? `${classId}::${subjectId}`
            : subjectId;

      if (isIndependent) {
        const fallback = buildFallbackBooks(resolvedSubjectId);
        return res.json({
          ...splitBooksByType([...fallback.ncertBooks, ...fallback.referenceBooks]),
          items: [...fallback.ncertBooks, ...fallback.referenceBooks]
        });
      }

      const subject = isIndependent
        ? null
        : await prisma.academicSubject.findFirst({
            where: { id: subjectId, classId, schoolId: user.schoolId },
            select: { id: true }
          });

      if (!isIndependent && !subject) {
        return next(new HttpError(404, "Subject not found for class"));
      }

      let books = await prisma.academicBook.findMany({
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
      const classId =
        typeof req.query.classId === "string" ? req.query.classId : "";
      const subjectId =
        typeof req.query.subjectId === "string" ? req.query.subjectId : "";
      const fallbackClassId = classId.startsWith("default-")
        ? classId
        : bookId.startsWith("default-")
          ? (bookId.split("::")[0] ?? "")
          : subjectId.startsWith("default-")
            ? (subjectId.split("::")[0] ?? "")
            : "";
      const isIndependent = Boolean(fallbackClassId);

      const book = isIndependent
        ? null
        : user.schoolId
        ? await prisma.academicBook.findFirst({
            where: { id: bookId, schoolId: user.schoolId },
            select: {
              id: true,
              name: true,
              subjectId: true,
              subject: { select: { classId: true } }
            }
          })
        : null;

      if (!isIndependent && user.schoolId && !book) {
        return next(new HttpError(404, "Book not found"));
      }

      let chapters = user.schoolId && !isIndependent
        ? await prisma.academicChapter.findMany({
            where: { bookId, schoolId: user.schoolId },
            orderBy: { title: "asc" },
            select: {
              id: true,
              title: true,
              bookId: true
            },
          })
        : [];

      if (chapters.length === 0 && isIndependent) {
        console.log("Fallback -> loading chapters from JSON");
        return res.json(buildFallbackChaptersFromContext(fallbackClassId, subjectId, bookId));
      }

      res.json({ subjectId: book!.subjectId, bookName: book!.name, items: chapters });
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
      const classId =
        typeof req.query.classId === "string" ? req.query.classId : "";
      const subjectId =
        typeof req.query.subjectId === "string" ? req.query.subjectId : "";
      const fallbackClassId = classId.startsWith("default-")
        ? classId
        : bookId.startsWith("default-")
          ? (bookId.split("::")[0] ?? "")
          : subjectId.startsWith("default-")
            ? (subjectId.split("::")[0] ?? "")
            : "";
      const isIndependent = Boolean(fallbackClassId);

      const book = isIndependent
        ? null
        : await prisma.academicBook.findFirst({
            where: { id: bookId, schoolId: user.schoolId },
            select: {
              id: true,
              name: true,
              subjectId: true,
              subject: { select: { classId: true } }
            }
          });

      if (!isIndependent && !book) {
        return next(new HttpError(404, "Book not found"));
      }

      let chapters = isIndependent
        ? []
        : await prisma.academicChapter.findMany({
            where: { bookId, schoolId: user.schoolId },
            orderBy: { title: "asc" },
            select: {
              id: true,
              title: true,
              bookId: true
            },
          });

      if (chapters.length === 0 && isIndependent) {
        console.log("Fallback -> loading chapters from JSON");
        return res.json(buildFallbackChaptersFromContext(fallbackClassId, subjectId, bookId));
      }

      res.json({ subjectId: book!.subjectId, bookName: book!.name, items: chapters });
    } catch (error) {
      next(error);
    }
  }
);

/* ======================================================
   EXPORT
====================================================== */

export default router;
