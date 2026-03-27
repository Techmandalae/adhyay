import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "";
const shouldUseAdapter = databaseUrl !== "";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
  prismaAdapter?: PrismaPg;
};

const prismaPool = shouldUseAdapter
  ? globalForPrisma.prismaPool ??
    new Pool({ connectionString: databaseUrl })
  : undefined;

const prismaAdapter = shouldUseAdapter && prismaPool
  ? globalForPrisma.prismaAdapter ?? new PrismaPg(prismaPool)
  : undefined;

if (shouldUseAdapter && !prismaAdapter) {
  throw new Error("Prisma adapter could not be initialized for PostgreSQL.");
}

const prismaClient = prismaAdapter
  ? new PrismaClient({ adapter: prismaAdapter })
  : new PrismaClient({});

export const prisma = globalForPrisma.prisma ?? prismaClient;

// Prevent multiple clients in dev (hot reload safe)
if (process.env.NODE_ENV !== "production") {
  if (prismaPool) {
    globalForPrisma.prismaPool = prismaPool;
  }
  if (prismaAdapter) {
    globalForPrisma.prismaAdapter = prismaAdapter;
  }
  globalForPrisma.prisma = prisma;
}
