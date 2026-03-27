-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerKey" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "examPaperId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_examId_key" ON "ExamPaper"("examId");

-- CreateIndex
CREATE INDEX "ExamPaper_schoolId_idx" ON "ExamPaper"("schoolId");

-- CreateIndex
CREATE INDEX "ExamPaper_examId_idx" ON "ExamPaper"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerKey_examPaperId_key" ON "AnswerKey"("examPaperId");

-- CreateIndex
CREATE INDEX "AnswerKey_schoolId_idx" ON "AnswerKey"("schoolId");

-- CreateIndex
CREATE INDEX "AnswerKey_examPaperId_idx" ON "AnswerKey"("examPaperId");

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerKey" ADD CONSTRAINT "AnswerKey_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerKey" ADD CONSTRAINT "AnswerKey_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
