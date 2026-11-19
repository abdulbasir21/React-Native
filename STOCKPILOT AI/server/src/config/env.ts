import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnvFile(): void {
  const envPath = path.resolve(__dirname, '../../.env');
  dotenv.config({ path: envPath, quiet: true });
}

const envSchema = z
  .object({
    DATABASE_URL: z.string().trim().min(1),
    Test_DATABASE_URL: z.string().trim().optional(),
    JWT_SECRET: z.string().trim().min(16),
    JWT_EXPIRES_IN: z.string().trim().min(1).default('30d'),
    GEMINI_API_KEY: z.string().trim().optional(),
    Gemini_Key: z.string().trim().optional(),
    GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.8-flash'),
    PORT: z.coerce.number().int().positive().default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    AI_DAILY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(30),
    AI_STRONG_CONFIRM_AMOUNT: z.string().trim().min(1).default('50000.00'),
    DEMO_OWNER_PASSWORD: z.string().trim().min(8).default('StockPilot#Demo2026!'),
  })
  .superRefine((val, ctx) => {
    const geminiKey = val.GEMINI_API_KEY || val.Gemini_Key;
    if (!geminiKey || geminiKey.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GEMINI_API_KEY'],
        message: 'Missing required variable',
      });
    }
  });

export interface AppEnv {
  DATABASE_URL: string;
  Test_DATABASE_URL?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  AI_DAILY_MESSAGE_LIMIT: number;
  AI_STRONG_CONFIRM_AMOUNT: string;
  DEMO_OWNER_PASSWORD: string;
}

export function validateEnv(raw: Record<string, string | undefined>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const missingOrInvalidKeys = Array.from(
      new Set(
        parsed.error.issues
          .map((issue) => issue.path.join('.'))
          .filter((key) => key.length > 0),
      ),
    );
    throw new Error(
      `Missing or invalid server environment variables: ${missingOrInvalidKeys.join(', ')}`,
    );
  }

  const geminiKey = (parsed.data.GEMINI_API_KEY || parsed.data.Gemini_Key)!;
  return {
    DATABASE_URL: parsed.data.DATABASE_URL,
    Test_DATABASE_URL: parsed.data.Test_DATABASE_URL,
    JWT_SECRET: parsed.data.JWT_SECRET,
    JWT_EXPIRES_IN: parsed.data.JWT_EXPIRES_IN,
    GEMINI_API_KEY: geminiKey,
    GEMINI_MODEL: parsed.data.GEMINI_MODEL,
    PORT: parsed.data.PORT,
    NODE_ENV: parsed.data.NODE_ENV,
    AI_DAILY_MESSAGE_LIMIT: parsed.data.AI_DAILY_MESSAGE_LIMIT,
    AI_STRONG_CONFIRM_AMOUNT: parsed.data.AI_STRONG_CONFIRM_AMOUNT,
    DEMO_OWNER_PASSWORD: parsed.data.DEMO_OWNER_PASSWORD,
  };
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    loadEnvFile();
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

export function resetCachedEnv(): void {
  cachedEnv = null;
}
