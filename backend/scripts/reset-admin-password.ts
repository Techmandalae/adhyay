import "dotenv/config";
import bcrypt from "bcrypt";

import { prisma } from "../src/db/prisma";

const DEFAULT_PASSWORD = "ChangeMe123!";
const SUPER_ADMIN_EMAIL =
  process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@exambuddy.local";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run admin password reset in production.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const result = await prisma.user.updateMany({
    where: {
      role: "SUPER_ADMIN"
    },
    data: {
      passwordHash,
      isActive: true,
      approvalStatus: "APPROVED"
    }
  });

  if (result.count === 0) {
    const fallback = await prisma.user.updateMany({
      where: {
        role: "SUPER_ADMIN",
        email: SUPER_ADMIN_EMAIL
      },
      data: {
        passwordHash,
        isActive: true,
        approvalStatus: "APPROVED"
      }
    });

    if (fallback.count === 0) {
      console.error("No super admin user found to reset.");
      process.exit(1);
    }
  }

  console.log("Admin password reset to ChangeMe123! (development only).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
