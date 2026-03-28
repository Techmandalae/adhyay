import "dotenv/config";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import { PrismaClient, BookType, UserRole } from "@prisma/client";

type NcertChapterInput =
  | string
  | {
      title?: string;
      summary?: string;
      keywords?: string;
    };

type NcertBookInput = {
  book?: string;
  name?: string;
  chapters?: NcertChapterInput[];
};

type NcertSubjectInput = {
  book?: string;
  name?: string;
  chapters?: NcertChapterInput[];
  books?: NcertBookInput[];
};

type NcertClassData = Record<string, NcertSubjectInput>;

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@exambuddy.com";
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "Super@123";
const SCHOOL_NAME = "Green Valley Public School";
const SCHOOL_EMAIL = "info@gvps.com";
const PRINCIPAL_EMAIL = "principal@gvps.com";
const PRINCIPAL_PASSWORD = "Admin@123";
const TEACHER_EMAIL = "math@gvps.com";
const TEACHER_PASSWORD = "Teacher@123";
const STUDENT_ONE_EMAIL = "rahul@gvps.com";
const STUDENT_TWO_EMAIL = "meera@gvps.com";
const STUDENT_PASSWORD = "Student@123";
const PARENT_EMAIL = "parent1@gmail.com";
const PARENT_PASSWORD = "Parent@123";

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function generatePublicId(seed: string) {
  return `EB-${seed.toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(8, "X").slice(0, 8)}`;
}

function parseClassLevelFromFile(fileName: string) {
  const match = fileName.match(/class(\d+)\.json$/i);
  if (!match) {
    throw new Error(`Unable to parse class level from ${fileName}`);
  }
  return Number(match[1]);
}

function getSectionsForClass(classLevel: number) {
  return classLevel >= 11 ? ["Science", "Commerce", "Arts"] : ["A", "B", "C"];
}

function normalizeBookEntries(subjectData: NcertSubjectInput | undefined): Array<{ name: string; chapters: NcertChapterInput[] }> {
  if (!subjectData) {
    return [];
  }

  const books: NcertBookInput[] =
    Array.isArray(subjectData.books) && subjectData.books.length > 0
      ? subjectData.books
      : subjectData.book || subjectData.name
        ? [
            {
              book: (subjectData.book ?? subjectData.name ?? "").trim(),
              chapters: subjectData.chapters ?? []
            }
          ]
        : [];

  return books
    .map((book) => ({
      name: (book.book ?? book.name ?? "").trim(),
      chapters: Array.isArray(book.chapters) ? book.chapters : []
    }))
    .filter((book) => book.name.length > 0);
}

function normalizeChapterEntries(chapters: NcertChapterInput[]) {
  return chapters
    .map((chapter) =>
      typeof chapter === "string"
        ? { title: chapter.trim(), summary: undefined, keywords: undefined }
        : {
            title: (chapter.title ?? "").trim(),
            summary: chapter.summary?.trim(),
            keywords: chapter.keywords?.trim()
          }
    )
    .filter((chapter) => chapter.title.length > 0);
}

function loadReferenceData(referencePath: string) {
  const merged = new Map<string, Set<string>>();
  const files = fs
    .readdirSync(referencePath)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const fileData = readJsonFile<Record<string, string[]>>(path.join(referencePath, file));
    for (const [subjectName, bookNames] of Object.entries(fileData)) {
      const subjectKey = subjectName.trim().toLowerCase();
      const set = merged.get(subjectKey) ?? new Set<string>();
      for (const bookName of bookNames ?? []) {
        const normalizedName = bookName.trim();
        if (normalizedName) {
          set.add(normalizedName);
        }
      }
      merged.set(subjectKey, set);
    }
  }

  return new Map(
    Array.from(merged.entries()).map(([subjectKey, bookNames]) => [
      subjectKey,
      Array.from(bookNames).sort((a, b) => a.localeCompare(b))
    ])
  );
}

async function upsertSchool() {
  const existing = await prisma.school.findFirst({ where: { name: SCHOOL_NAME } });
  if (existing) {
    return existing;
  }

  return prisma.school.create({
    data: {
      name: SCHOOL_NAME,
      email: SCHOOL_EMAIL,
      status: "ACTIVE",
      aiMonthlyLimit: 0,
      domain: "gvps.com"
    }
  });
}

async function ensureClassStandard(schoolId: string, name: string, hasStreams: boolean) {
  return prisma.academicClassStandard.upsert({
    where: { schoolId_name: { schoolId, name } },
    update: { hasStreams },
    create: { schoolId, name, hasStreams }
  });
}

async function ensureClass(schoolId: string, classLevel: number, name: string, classStandardId: string) {
  return prisma.academicClass.upsert({
    where: { schoolId_classLevel: { schoolId, classLevel } },
    update: { name, classStandardId },
    create: { schoolId, classLevel, name, classStandardId, isSystem: true }
  });
}

async function ensureSection(schoolId: string, classStandardId: string, name: string) {
  return prisma.academicSection.upsert({
    where: { classStandardId_name: { classStandardId, name } },
    update: {},
    create: { schoolId, classStandardId, name }
  });
}

async function ensureSubject(schoolId: string, classId: string, name: string) {
  return prisma.academicSubject.upsert({
    where: { schoolId_classId_name: { schoolId, classId, name } },
    update: {},
    create: { schoolId, classId, name, isSystem: true }
  });
}

async function ensureBook(schoolId: string, subjectId: string, name: string, type: BookType) {
  return prisma.academicBook.upsert({
    where: { schoolId_subjectId_name: { schoolId, subjectId, name } },
    update: { type },
    create: { schoolId, subjectId, name, type, isSystem: true }
  });
}

async function ensureChapter(
  schoolId: string,
  bookId: string,
  title: string,
  chapterNumber: number,
  subjectId: string,
  classStandardId: string,
  summary?: string,
  keywords?: string
) {
  const contextData = {
    ...(summary !== undefined ? { summary } : {}),
    ...(keywords !== undefined ? { keywords } : {})
  };

  return prisma.academicChapter.upsert({
    where: { schoolId_bookId_title: { schoolId, bookId, title } },
    update: { chapterNumber, subjectId, classStandardId, ...contextData },
    create: {
      schoolId,
      bookId,
      title,
      chapterNumber,
      ...contextData,
      subjectId,
      classStandardId,
      isSystem: true
    }
  });
}

async function ensureSyllabusChapter(
  schoolId: string,
  classStandardId: string,
  subjectId: string,
  chapterNumber: number,
  chapterTitle: string
) {
  return prisma.syllabusChapter.upsert({
    where: {
      schoolId_classStandardId_subjectId_chapterNumber: {
        schoolId,
        classStandardId,
        subjectId,
        chapterNumber
      }
    },
    update: {
      chapterTitle
    },
    create: {
      schoolId,
      classStandardId,
      subjectId,
      chapterNumber,
      chapterTitle
    }
  });
}

async function syncSubjectCatalog(
  schoolId: string,
  classStandardId: string,
  subjectId: string,
  subjectName: string,
  subjectData: NcertSubjectInput | undefined,
  referenceData: Map<string, string[]>
) {
  const ncertBooks = normalizeBookEntries(subjectData);
  const allowedNcertBookNames = new Set(ncertBooks.map((book) => book.name));
  const referenceBooks = referenceData.get(subjectName.trim().toLowerCase()) ?? [];
  const allowedReferenceBookNames = new Set(referenceBooks);

  let chapterNumber = 1;

  for (const book of ncertBooks) {
    const createdBook = await ensureBook(schoolId, subjectId, book.name, BookType.NCERT);
    const chapters = normalizeChapterEntries(book.chapters);
    const chapterTitles = chapters.map((chapter) => chapter.title);

    for (const chapter of chapters) {
      await ensureChapter(
        schoolId,
        createdBook.id,
        chapter.title,
        chapterNumber,
        subjectId,
        classStandardId,
        chapter.summary,
        chapter.keywords
      );
      await ensureSyllabusChapter(
        schoolId,
        classStandardId,
        subjectId,
        chapterNumber,
        chapter.title
      );
      chapterNumber += 1;
    }

    if (chapterTitles.length > 0) {
      await prisma.academicChapter.deleteMany({
        where: {
          schoolId,
          bookId: createdBook.id,
          isSystem: true,
          title: { notIn: chapterTitles }
        }
      });
    } else {
      await prisma.academicChapter.deleteMany({
        where: {
          schoolId,
          bookId: createdBook.id,
          isSystem: true
        }
      });
    }
  }

  for (const referenceBook of referenceBooks) {
    await ensureBook(schoolId, subjectId, referenceBook, BookType.REFERENCE);
  }

  const existingBooks = await prisma.academicBook.findMany({
    where: {
      schoolId,
      subjectId,
      isSystem: true
    },
    select: {
      id: true,
      name: true,
      type: true
    }
  });

  const staleBookIds = existingBooks
    .filter((book) => {
      if (book.type === BookType.NCERT) {
        return !allowedNcertBookNames.has(book.name);
      }
      return !allowedReferenceBookNames.has(book.name);
    })
    .map((book) => book.id);

  if (staleBookIds.length > 0) {
    await prisma.academicBook.deleteMany({
      where: {
        schoolId,
        id: { in: staleBookIds }
      }
    });
  }

  if (chapterNumber > 1) {
    const chapterNumbers = Array.from({ length: chapterNumber - 1 }, (_value, index) => index + 1);
    await prisma.syllabusChapter.deleteMany({
      where: {
        schoolId,
        classStandardId,
        subjectId,
        chapterNumber: { notIn: chapterNumbers }
      }
    });
  } else {
    await prisma.syllabusChapter.deleteMany({
      where: {
        schoolId,
        classStandardId,
        subjectId
      }
    });
  }
}

async function seedAcademicStructure(schoolId: string) {
  const sectionMap = new Map<number, string>();
  const ncertPath = path.join(__dirname, "../src/data/ncert");
  const referencePath = path.join(__dirname, "../src/data/reference");
  const referenceData = loadReferenceData(referencePath);

  const ncertFiles = fs
    .readdirSync(ncertPath)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => parseClassLevelFromFile(a) - parseClassLevelFromFile(b));

  for (const file of ncertFiles) {
    const classLevel = parseClassLevelFromFile(file);
    const className = `Class ${classLevel}`;
    const classData = readJsonFile<NcertClassData>(path.join(ncertPath, file));

    const standard = await ensureClassStandard(schoolId, className, classLevel >= 11);

    for (const section of getSectionsForClass(classLevel)) {
      await ensureSection(schoolId, standard.id, section);
    }

    const createdClass = await ensureClass(schoolId, classLevel, className, standard.id);

    const defaultSection = await prisma.academicSection.findFirst({
      where: { schoolId, classStandardId: standard.id },
      orderBy: { name: "asc" },
      select: { id: true }
    });

    if (defaultSection) {
      sectionMap.set(classLevel, defaultSection.id);
    }

    const subjectNames = Object.keys(classData).sort((a, b) => a.localeCompare(b));

    for (const subjectName of subjectNames) {
      const subject = await ensureSubject(schoolId, createdClass.id, subjectName);
      await syncSubjectCatalog(
        schoolId,
        standard.id,
        subject.id,
        subjectName,
        classData[subjectName],
        referenceData
      );
    }
  }

  console.log("Academic data seeded successfully");
  return sectionMap;
}

async function seedUsers(schoolId: string, sectionMap: Map<number, string>) {
  const superAdminHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  const principalHash = await bcrypt.hash(PRINCIPAL_PASSWORD, 12);
  const teacherHash = await bcrypt.hash(TEACHER_PASSWORD, 12);
  const studentHash = await bcrypt.hash(STUDENT_PASSWORD, 12);
  const parentHash = await bcrypt.hash(PARENT_PASSWORD, 12);

  const superAdminUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: SUPER_ADMIN_EMAIL } },
    update: { passwordHash: superAdminHash },
    create: {
      publicId: generatePublicId("superadmin"),
      schoolId,
      email: SUPER_ADMIN_EMAIL,
      passwordHash: superAdminHash,
      emailVerified: true,
      role: UserRole.SUPER_ADMIN,
      name: "Super Admin",
      approvalStatus: "APPROVED",
      isActive: true
    }
  });

  const principalUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: PRINCIPAL_EMAIL } },
    update: { passwordHash: principalHash },
    create: {
      publicId: generatePublicId("principal"),
      schoolId,
      email: PRINCIPAL_EMAIL,
      passwordHash: principalHash,
      emailVerified: true,
      role: UserRole.ADMIN,
      name: "Principal",
      approvalStatus: "APPROVED",
      isActive: true,
      adminProfile: {
        create: {
          schoolId,
          title: "Principal"
        }
      }
    },
    include: { adminProfile: true }
  });

  const teacherUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: TEACHER_EMAIL } },
    update: { passwordHash: teacherHash },
    create: {
      publicId: generatePublicId("teacher01"),
      schoolId,
      email: TEACHER_EMAIL,
      passwordHash: teacherHash,
      emailVerified: true,
      role: UserRole.TEACHER,
      name: "Math Teacher",
      approvalStatus: "APPROVED",
      isActive: true,
      teacherProfile: {
        create: {
          schoolId,
          employeeId: "T-010"
        }
      }
    },
    include: { teacherProfile: true }
  });

  const studentClass = await prisma.academicClass.findFirst({
    where: { schoolId, classLevel: 10 }
  });

  if (!studentClass) {
    throw new Error("Class 10 not found while seeding students.");
  }

  const studentOneUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: STUDENT_ONE_EMAIL } },
    update: { passwordHash: studentHash },
    create: {
      publicId: generatePublicId("student1"),
      schoolId,
      email: STUDENT_ONE_EMAIL,
      passwordHash: studentHash,
      emailVerified: true,
      role: UserRole.STUDENT,
      name: "Rahul",
      approvalStatus: "APPROVED",
      isActive: true,
      studentProfile: {
        create: {
          schoolId,
          classId: studentClass.id,
          classLevel: studentClass.classLevel,
          sectionId: sectionMap.get(studentClass.classLevel) ?? null,
          rollNumber: "GVPS-10A-01",
          dob: new Date("2010-04-15")
        }
      }
    },
    include: { studentProfile: true }
  });

  const studentTwoUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: STUDENT_TWO_EMAIL } },
    update: { passwordHash: studentHash },
    create: {
      publicId: generatePublicId("student2"),
      schoolId,
      email: STUDENT_TWO_EMAIL,
      passwordHash: studentHash,
      emailVerified: true,
      role: UserRole.STUDENT,
      name: "Meera",
      approvalStatus: "APPROVED",
      isActive: true,
      studentProfile: {
        create: {
          schoolId,
          classId: studentClass.id,
          classLevel: studentClass.classLevel,
          sectionId: sectionMap.get(studentClass.classLevel) ?? null,
          rollNumber: "GVPS-10A-02",
          dob: new Date("2010-08-20")
        }
      }
    },
    include: { studentProfile: true }
  });

  const parentUser = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: PARENT_EMAIL } },
    update: { passwordHash: parentHash },
    create: {
      publicId: generatePublicId("parent01"),
      schoolId,
      email: PARENT_EMAIL,
      passwordHash: parentHash,
      emailVerified: true,
      role: UserRole.PARENT,
      name: "Parent One",
      approvalStatus: "APPROVED",
      isActive: true,
      parentProfile: {
        create: { schoolId }
      }
    },
    include: { parentProfile: true }
  });

  const [studentOneProfile, studentTwoProfile] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { userId: studentOneUser.id },
      select: { id: true }
    }),
    prisma.studentProfile.findUnique({
      where: { userId: studentTwoUser.id },
      select: { id: true }
    })
  ]);

  const teacherProfile = teacherUser.teacherProfile;
  if (teacherProfile) {
    const teacherClasses = await prisma.academicClass.findMany({
      where: { schoolId },
      select: { id: true }
    });

    await prisma.teacherClass.createMany({
      data: teacherClasses.map((academicClass) => ({
        schoolId,
        teacherId: teacherProfile.id,
        classId: academicClass.id
      })),
      skipDuplicates: true
    });
  }

  if (parentUser.parentProfile && studentOneProfile) {
    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: {
          parentId: parentUser.parentProfile.id,
          studentId: studentOneProfile.id
        }
      },
      update: {},
      create: {
        schoolId,
        parentId: parentUser.parentProfile.id,
        studentId: studentOneProfile.id
      }
    });
  }

  if (parentUser.parentProfile && studentTwoProfile) {
    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: {
          parentId: parentUser.parentProfile.id,
          studentId: studentTwoProfile.id
        }
      },
      update: {},
      create: {
        schoolId,
        parentId: parentUser.parentProfile.id,
        studentId: studentTwoProfile.id
      }
    });
  }

  return { superAdminUser, principalUser, teacherUser, studentOneUser, studentTwoUser, parentUser };
}

async function main() {
  const school = await upsertSchool();
  const sectionMap = await seedAcademicStructure(school.id);
  await seedUsers(school.id, sectionMap);

  console.log("Seed completed for Green Valley Public School.");
  console.log(`School ID: ${school.id}`);
  console.log(`Super admin email: ${SUPER_ADMIN_EMAIL}`);
  console.log(`Principal email: ${PRINCIPAL_EMAIL}`);
  console.log(`Teacher email: ${TEACHER_EMAIL}`);
  console.log(`Student emails: ${STUDENT_ONE_EMAIL}, ${STUDENT_TWO_EMAIL}`);
  console.log(`Parent email: ${PARENT_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
