ALTER TABLE "User"
ADD COLUMN "publicId" TEXT,
ADD COLUMN "emailVerificationExpires" TIMESTAMP(3);

UPDATE "User"
SET "publicId" = 'EB-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 10))
WHERE "publicId" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "publicId" SET NOT NULL;

ALTER TABLE "User"
DROP COLUMN IF EXISTS "mobileVerified",
DROP COLUMN IF EXISTS "mobileOTP";

CREATE UNIQUE INDEX "User_publicId_key" ON "User"("publicId");

CREATE TABLE "SyllabusChapter" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classStandardId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "chapterNumber" INTEGER NOT NULL,
  "chapterTitle" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyllabusChapter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyllabusChapter_schoolId_idx" ON "SyllabusChapter"("schoolId");
CREATE INDEX "SyllabusChapter_classStandardId_idx" ON "SyllabusChapter"("classStandardId");
CREATE INDEX "SyllabusChapter_subjectId_idx" ON "SyllabusChapter"("subjectId");
CREATE UNIQUE INDEX "SyllabusChapter_schoolId_classStandardId_subjectId_chapterNumber_key"
ON "SyllabusChapter"("schoolId", "classStandardId", "subjectId", "chapterNumber");

CREATE TABLE "QuestionBank" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classStandardId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "chapterId" TEXT,
  "difficulty" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "optionA" TEXT,
  "optionB" TEXT,
  "optionC" TEXT,
  "optionD" TEXT,
  "answer" TEXT,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionBank_schoolId_idx" ON "QuestionBank"("schoolId");
CREATE INDEX "QuestionBank_classStandardId_idx" ON "QuestionBank"("classStandardId");
CREATE INDEX "QuestionBank_subjectId_idx" ON "QuestionBank"("subjectId");
CREATE INDEX "QuestionBank_chapterId_idx" ON "QuestionBank"("chapterId");
CREATE INDEX "QuestionBank_difficulty_idx" ON "QuestionBank"("difficulty");
