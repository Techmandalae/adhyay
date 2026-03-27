-- DropIndex
DROP INDEX "AcademicBook_subjectId_name_key";

-- DropIndex
DROP INDEX "AcademicChapter_bookId_title_key";

-- DropIndex
DROP INDEX "AcademicSubject_classId_name_key";

-- AlterTable
ALTER TABLE "ExamSubmission" ADD COLUMN     "structuredAnswers" JSONB,
ALTER COLUMN "filePath" DROP NOT NULL,
ALTER COLUMN "fileName" DROP NOT NULL,
ALTER COLUMN "fileMime" DROP NOT NULL,
ALTER COLUMN "fileSize" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "examCount" INTEGER NOT NULL DEFAULT 0,
    "limitCount" INTEGER,
    "limitNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageCounter_schoolId_idx" ON "UsageCounter"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_schoolId_periodKey_key" ON "UsageCounter"("schoolId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubmission_examId_studentId_key" ON "ExamSubmission"("examId", "studentId");
