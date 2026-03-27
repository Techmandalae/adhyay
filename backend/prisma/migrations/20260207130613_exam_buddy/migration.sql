-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "aiPayload" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSubmission" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeTakenSeconds" INTEGER,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,

    CONSTRAINT "ExamSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamEvaluation" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "aiScore" DOUBLE PRECISION,
    "aiResult" JSONB,
    "aiFlags" JSONB,
    "teacherScore" DOUBLE PRECISION,
    "teacherResult" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamSubmission_examId_idx" ON "ExamSubmission"("examId");

-- CreateIndex
CREATE INDEX "ExamSubmission_studentId_idx" ON "ExamSubmission"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamEvaluation_submissionId_key" ON "ExamEvaluation"("submissionId");

-- CreateIndex
CREATE INDEX "ExamEvaluation_examId_idx" ON "ExamEvaluation"("examId");

-- CreateIndex
CREATE INDEX "ExamEvaluation_studentId_idx" ON "ExamEvaluation"("studentId");

-- CreateIndex
CREATE INDEX "ExamEvaluation_status_idx" ON "ExamEvaluation"("status");

-- AddForeignKey
ALTER TABLE "ExamSubmission" ADD CONSTRAINT "ExamSubmission_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamEvaluation" ADD CONSTRAINT "ExamEvaluation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ExamSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamEvaluation" ADD CONSTRAINT "ExamEvaluation_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
