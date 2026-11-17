import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { disconnectPrisma, getPrisma } from './lib/prisma.js';

async function main(): Promise<void> {
  const env = getEnv();
  const prisma = getPrisma();
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`StockPilot API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Server startup failed:', err instanceof Error ? err.message : 'Unknown error');
  process.exit(1);
});
