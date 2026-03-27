-- AlterTable
ALTER TABLE "User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailVerificationToken" TEXT,
ADD COLUMN "mobileVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mobileOTP" TEXT;
