import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const cliArgs = process.argv.join(" ").toLowerCase();
const needsShadow =
  cliArgs.includes("migrate dev") ||
  (cliArgs.includes("migrate diff") &&
    (cliArgs.includes("--from-migrations") || cliArgs.includes("--to-migrations")));
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

if (needsShadow && !shadowDatabaseUrl) {
  throw new Error(
    "SHADOW_DATABASE_URL is required for prisma migrate/diff. Create a shadow database and set " +
      "SHADOW_DATABASE_URL, e.g. postgresql://user:password@localhost:5432/exam_buddy_shadow"
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {})
  }
});
