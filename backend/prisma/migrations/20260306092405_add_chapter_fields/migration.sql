-- AlterTable
ALTER TABLE "AcademicChapter" ADD COLUMN     "chapterNumber" INTEGER,
ADD COLUMN     "classStandardId" TEXT,
ADD COLUMN     "subjectId" TEXT;

-- CreateIndex
CREATE INDEX "AcademicChapter_subjectId_idx" ON "AcademicChapter"("subjectId");

-- CreateIndex
CREATE INDEX "AcademicChapter_classStandardId_idx" ON "AcademicChapter"("classStandardId");

-- AddForeignKey
ALTER TABLE "AcademicChapter" ADD CONSTRAINT "AcademicChapter_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "AcademicSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicChapter" ADD CONSTRAINT "AcademicChapter_classStandardId_fkey" FOREIGN KEY ("classStandardId") REFERENCES "AcademicClassStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
