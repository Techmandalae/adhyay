-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- Data migration for roles and statuses
UPDATE "User" SET "role" = 'ADMIN' WHERE "role" = 'PRINCIPAL';

-- AlterEnum
BEGIN;
CREATE TYPE "ExamStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
ALTER TABLE "public"."Exam" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Exam" ALTER COLUMN "status" TYPE "ExamStatus_new"
USING (CASE WHEN "status"::text = 'CLOSED' THEN 'ARCHIVED' ELSE "status"::text END)::"ExamStatus_new";
ALTER TYPE "ExamStatus" RENAME TO "ExamStatus_old";
ALTER TYPE "ExamStatus_new" RENAME TO "ExamStatus";
DROP TYPE "public"."ExamStatus_old";
ALTER TABLE "Exam" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "isSuperAdmin" = true;

-- DropIndex
DROP INDEX "ParentStudent_parentId_studentId_key";

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "ParentStudent" DROP CONSTRAINT "ParentStudent_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "ParentStudent_pkey" PRIMARY KEY ("parentId", "studentId");

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "aiMonthlyLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "status" "SchoolStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "School"
SET "email" = COALESCE(
  (SELECT "email" FROM "User" WHERE "User"."schoolId" = "School"."id" AND "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1),
  'unknown@exambuddy.local'
);

UPDATE "School" SET "status" = 'ACTIVE' WHERE "status" = 'PENDING';

ALTER TABLE "School" ALTER COLUMN "email" SET NOT NULL;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "dateOfBirth" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isSuperAdmin",
ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "User" SET "approvalStatus" = 'APPROVED' WHERE "approvalStatus" = 'PENDING';

-- CreateTable
CREATE TABLE "TeacherClass" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherClass_schoolId_idx" ON "TeacherClass"("schoolId");

-- CreateIndex
CREATE INDEX "TeacherClass_teacherId_idx" ON "TeacherClass"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherClass_classId_idx" ON "TeacherClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherClass_teacherId_classId_key" ON "TeacherClass"("teacherId", "classId");

-- CreateIndex
CREATE INDEX "ExamTemplate_schoolId_idx" ON "ExamTemplate"("schoolId");

-- CreateIndex
CREATE INDEX "ExamTemplate_createdById_idx" ON "ExamTemplate"("createdById");

-- CreateIndex
CREATE INDEX "AiUsage_schoolId_idx" ON "AiUsage"("schoolId");

-- CreateIndex
CREATE INDEX "AiUsage_teacherId_idx" ON "AiUsage"("teacherId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExamTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTemplate" ADD CONSTRAINT "ExamTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed teacher-class assignments for existing data
INSERT INTO "TeacherClass" ("id", "schoolId", "teacherId", "classId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), t."schoolId", t."id", c."id", CURRENT_TIMESTAMP
FROM "TeacherProfile" t
JOIN "AcademicClass" c ON c."schoolId" = t."schoolId"
ON CONFLICT ("teacherId", "classId") DO NOTHING;
