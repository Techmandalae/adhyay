import "dotenv/config";

import http from "http";

import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";

async function bootstrap() {
  const app = createApp();

  await prisma.$connect();

  const server = http.createServer(app);
  server.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API listening on http://0.0.0.0:${env.PORT}`);
  });
}

void bootstrap();
