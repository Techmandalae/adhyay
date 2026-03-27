/*
  Warnings:

  - You are about to drop the column `nameEn` on the `AcademicBook` table. All the data in the column will be lost.
  - You are about to drop the column `nameHi` on the `AcademicBook` table. All the data in the column will be lost.
  - You are about to drop the column `part` on the `AcademicBook` table. All the data in the column will be lost.
  - You are about to drop the column `chapterNo` on the `AcademicChapter` table. All the data in the column will be lost.
  - You are about to drop the column `titleEn` on the `AcademicChapter` table. All the data in the column will be lost.
  - You are about to drop the column `titleHi` on the `AcademicChapter` table. All the data in the column will be lost.
  - You are about to drop the column `board` on the `AcademicClass` table. All the data in the column will be lost.
  - You are about to drop the column `label` on the `AcademicClass` table. All the data in the column will be lost.
  - You are about to drop the column `nameEn` on the `AcademicSubject` table. All the data in the column will be lost.
  - You are about to drop the column `nameHi` on the `AcademicSubject` table. All the data in the column will be lost.
  - You are about to drop the `SchoolAcademicBook` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SchoolAcademicChapter` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SchoolAcademicClass` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SchoolAcademicSubject` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[classLevel]` on the table `AcademicClass` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `AcademicBook` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AcademicBook` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `AcademicChapter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AcademicChapter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `AcademicClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AcademicClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `AcademicSubject` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AcademicSubject` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- DropForeignKey
ALTER TABLE "SchoolAcademicBook" DROP CONSTRAINT "SchoolAcademicBook_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "SchoolAcademicChapter" DROP CONSTRAINT "SchoolAcademicChapter_bookId_fkey";

-- DropForeignKey
ALTER TABLE "SchoolAcademicSubject" DROP CONSTRAINT "SchoolAcademicSubject_classId_fkey";

-- DropIndex
DROP INDEX "AcademicClass_classLevel_idx";

-- AlterTable
ALTER TABLE "AcademicBook" DROP COLUMN "nameEn",
DROP COLUMN "nameHi",
DROP COLUMN "part",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "AcademicChapter" DROP COLUMN "chapterNo",
DROP COLUMN "titleEn",
DROP COLUMN "titleHi",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "AcademicClass" DROP COLUMN "board",
DROP COLUMN "label",
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "AcademicSubject" DROP COLUMN "nameEn",
DROP COLUMN "nameHi",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "assignedClassId" TEXT,
ADD COLUMN     "assignedClassLevel" INTEGER,
ADD COLUMN     "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT';

-- DropTable
DROP TABLE "SchoolAcademicBook";

-- DropTable
DROP TABLE "SchoolAcademicChapter";

-- DropTable
DROP TABLE "SchoolAcademicClass";

-- DropTable
DROP TABLE "SchoolAcademicSubject";

-- CreateIndex
CREATE UNIQUE INDEX "AcademicClass_classLevel_key" ON "AcademicClass"("classLevel");
