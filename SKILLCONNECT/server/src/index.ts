import http from "node:http";
import cron from "node-cron";
import type { Server } from "socket.io";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import {
  runAutoCompleteJob,
  runNoShowDeadlineJob,
} from "./jobs/bookingLifecycleJobs.js";
import { runExpireOffersJob } from "./jobs/expireOffers.js";
import { logger } from "./lib/logger.js";
import { createPrismaClient } from "./lib/prisma.js";
import { createChatRepository } from "./modules/chat/chat.repository.js";
import { createChatService } from "./modules/chat/chat.service.js";
import { attachChatSocketServer } from "./sockets/chat.socket.js";

async function main() {
  const config = loadConfig();
  const prisma = createPrismaClient(config.DATABASE_URL);

  const checkDatabase = async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  };

  let io: Server | null = null;
  const app = createApp({
    config,
    prisma,
    checkDatabase,
    getIo: () => io,
  });

  const httpServer = http.createServer(app);
  const chatRepo = createChatRepository(prisma);
  const chatService = createChatService(prisma, chatRepo);
  io = attachChatSocketServer(httpServer, {
    config,
    prisma,
    chatRepo,
    chatService,
  });

  httpServer.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, "Server listening");
  });

  const expireOffersTask = cron.schedule("*/5 * * * *", () => {
    void runExpireOffersJob(prisma).catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : "expireOffersJob failed" },
        "Scheduled job error"
      );
    });
  });

  const lifecycleTask = cron.schedule("*/10 * * * *", () => {
    void Promise.all([
      runAutoCompleteJob(prisma, config),
      runNoShowDeadlineJob(prisma),
    ]).catch((err) => {
      logger.error(
        { err: err instanceof Error ? err.message : "lifecycleJob failed" },
        "Scheduled job error"
      );
    });
  });

  const shutdown = async () => {
    expireOffersTask.stop();
    lifecycleTask.stop();
    io?.close();
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : "Startup failed" });
  process.exit(1);
});
