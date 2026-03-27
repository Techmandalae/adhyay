/*
  Warnings:

  - A unique constraint covering the columns `[subjectId,name]` on the table `AcademicBook` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bookId,title]` on the table `AcademicChapter` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[classId,name]` on the table `AcademicSubject` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AcademicBook_subjectId_name_key" ON "AcademicBook"("subjectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicChapter_bookId_title_key" ON "AcademicChapter"("bookId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicSubject_classId_name_key" ON "AcademicSubject"("classId", "name");

-- CreateIndex
CREATE INDEX "Exam_status_idx" ON "Exam"("status");

-- CreateIndex
CREATE INDEX "Exam_assignedClassId_idx" ON "Exam"("assignedClassId");
