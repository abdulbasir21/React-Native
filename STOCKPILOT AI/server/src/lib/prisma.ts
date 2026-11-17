import { PrismaClient } from '@prisma/client';
import { getEnv } from '../config/env.js';

let prismaInstance: PrismaClient | null = null;
let warmedUp = false;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    const env = getEnv();
    const isTest = env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const dbUrl = isTest && env.Test_DATABASE_URL ? env.Test_DATABASE_URL : env.DATABASE_URL;
    prismaInstance = new PrismaClient({
      datasources: {
        db: { url: dbUrl },
      },
      transactionOptions: {
        maxWait: 20000,
        timeout: 60000,
      },
    });
  }
  return prismaInstance;
}

export async function ensurePrismaConnected(maxAttempts = 5): Promise<PrismaClient> {
  const prisma = getPrisma();
  if (warmedUp) {
    return prisma;
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      warmedUp = true;
      return prisma;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    warmedUp = false;
  }
}
