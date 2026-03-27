-- CreateEnum
CREATE TYPE "BookType" AS ENUM ('NCERT', 'REFERENCE');

-- CreateTable
CREATE TABLE "AcademicClass" (
    "id" TEXT NOT NULL,
    "classLevel" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "board" TEXT NOT NULL DEFAULT 'CBSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicSubject" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameHi" TEXT,

    CONSTRAINT "AcademicSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicBook" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameHi" TEXT,
    "type" "BookType" NOT NULL,
    "part" TEXT,

    CONSTRAINT "AcademicBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicChapter" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "chapterNo" INTEGER NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleHi" TEXT,

    CONSTRAINT "AcademicChapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicClass" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classLevel" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolAcademicClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicSubject" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SchoolAcademicSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicBook" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SchoolAcademicBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolAcademicChapter" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chapterNo" INTEGER NOT NULL,

    CONSTRAINT "SchoolAcademicChapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicClass_classLevel_idx" ON "AcademicClass"("classLevel");

-- CreateIndex
CREATE INDEX "AcademicSubject_classId_idx" ON "AcademicSubject"("classId");

-- CreateIndex
CREATE INDEX "AcademicBook_subjectId_idx" ON "AcademicBook"("subjectId");

-- CreateIndex
CREATE INDEX "AcademicChapter_bookId_idx" ON "AcademicChapter"("bookId");

-- CreateIndex
CREATE INDEX "SchoolAcademicClass_schoolId_idx" ON "SchoolAcademicClass"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolAcademicClass_classLevel_idx" ON "SchoolAcademicClass"("classLevel");

-- CreateIndex
CREATE INDEX "SchoolAcademicSubject_classId_idx" ON "SchoolAcademicSubject"("classId");

-- CreateIndex
CREATE INDEX "SchoolAcademicBook_subjectId_idx" ON "SchoolAcademicBook"("subjectId");

-- CreateIndex
CREATE INDEX "SchoolAcademicChapter_bookId_idx" ON "SchoolAcademicChapter"("bookId");

-- AddForeignKey
ALTER TABLE "AcademicSubject" ADD CONSTRAINT "AcademicSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicBook" ADD CONSTRAINT "AcademicBook_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "AcademicSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicChapter" ADD CONSTRAINT "AcademicChapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "AcademicBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicSubject" ADD CONSTRAINT "SchoolAcademicSubject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolAcademicClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicBook" ADD CONSTRAINT "SchoolAcademicBook_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SchoolAcademicSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolAcademicChapter" ADD CONSTRAINT "SchoolAcademicChapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "SchoolAcademicBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
