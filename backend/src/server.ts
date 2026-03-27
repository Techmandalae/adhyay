import "dotenv/config";

import http from "http";

import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";

async function bootstrap() {
  const app = createApp();
  const port = Number(process.env.PORT ?? env.PORT ?? 5000);

  await prisma.$connect();

  const server = http.createServer(app);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

void bootstrap();
