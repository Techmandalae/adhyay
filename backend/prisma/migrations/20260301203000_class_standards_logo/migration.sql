-- Ensure UUID helper is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable
ALTER TABLE "School" ADD COLUMN "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "AcademicClassStandard" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasStreams" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicClassStandard_pkey" PRIMARY KEY ("id")
);

-- Indexes for AcademicClassStandard
CREATE UNIQUE INDEX "AcademicClassStandard_schoolId_name_key" ON "AcademicClassStandard"("schoolId", "name");
CREATE INDEX "AcademicClassStandard_schoolId_idx" ON "AcademicClassStandard"("schoolId");

-- AlterTable
ALTER TABLE "AcademicClass" ADD COLUMN "classStandardId" TEXT;
ALTER TABLE "AcademicSection" ADD COLUMN "classStandardId" TEXT;

-- Backfill class standards for existing classes
INSERT INTO "AcademicClassStandard" ("id", "schoolId", "name", "hasStreams", "createdAt", "updatedAt")
SELECT DISTINCT gen_random_uuid(), "schoolId", "name", false, NOW(), NOW()
FROM "AcademicClass"
ON CONFLICT DO NOTHING;

-- Link classes to standards
UPDATE "AcademicClass" AS c
SET "classStandardId" = s."id"
FROM "AcademicClassStandard" AS s
WHERE c."schoolId" = s."schoolId"
  AND c."name" = s."name";

-- Link sections to standards via class
UPDATE "AcademicSection" AS sec
SET "classStandardId" = c."classStandardId"
FROM "AcademicClass" AS c
WHERE sec."classId" = c."id";

-- Enforce not-null after backfill
ALTER TABLE "AcademicSection" ALTER COLUMN "classStandardId" SET NOT NULL;

-- Drop old classId foreign key and indexes before removing column
ALTER TABLE "AcademicSection" DROP CONSTRAINT IF EXISTS "AcademicSection_classId_fkey";
DROP INDEX IF EXISTS "AcademicSection_classId_name_key";
DROP INDEX IF EXISTS "AcademicSection_classId_idx";

-- Remove old column
ALTER TABLE "AcademicSection" DROP COLUMN "classId";

-- Add new indexes
CREATE INDEX "AcademicClass_classStandardId_idx" ON "AcademicClass"("classStandardId");
CREATE INDEX "AcademicSection_classStandardId_idx" ON "AcademicSection"("classStandardId");
CREATE UNIQUE INDEX "AcademicSection_classStandardId_name_key" ON "AcademicSection"("classStandardId", "name");

-- Add new foreign keys
ALTER TABLE "AcademicClass" ADD CONSTRAINT "AcademicClass_classStandardId_fkey"
  FOREIGN KEY ("classStandardId") REFERENCES "AcademicClassStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AcademicSection" ADD CONSTRAINT "AcademicSection_classStandardId_fkey"
  FOREIGN KEY ("classStandardId") REFERENCES "AcademicClassStandard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademicClassStandard" ADD CONSTRAINT "AcademicClassStandard_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
