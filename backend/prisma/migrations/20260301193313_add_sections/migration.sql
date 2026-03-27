-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "sectionId" TEXT;

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "sectionId" TEXT;

-- CreateTable
CREATE TABLE "AcademicSection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicSection_schoolId_idx" ON "AcademicSection"("schoolId");

-- CreateIndex
CREATE INDEX "AcademicSection_classId_idx" ON "AcademicSection"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSection_classId_name_key" ON "AcademicSection"("classId", "name");

-- CreateIndex
CREATE INDEX "Exam_sectionId_idx" ON "Exam"("sectionId");

-- CreateIndex
CREATE INDEX "StudentProfile_sectionId_idx" ON "StudentProfile"("sectionId");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AcademicSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicSection" ADD CONSTRAINT "AcademicSection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicSection" ADD CONSTRAINT "AcademicSection_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AcademicSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
