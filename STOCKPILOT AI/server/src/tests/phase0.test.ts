import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { validateEnv } from '../config/env.js';
import { disconnectPrisma, ensurePrismaConnected } from '../lib/prisma.js';

describe('Phase 0 — Server setup, env validation, health & DB smoke test', () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('validateEnv throws naming missing variable DATABASE_URL without leaking values', () => {
    const fn = () =>
      validateEnv({
        JWT_SECRET: 'super_secret_key_for_testing_1234',
        Gemini_Key: 'fake_gemini_key',
      });
    expect(fn).toThrowError(/DATABASE_URL/);
    expect(fn).not.toThrowError(/super_secret_key_for_testing_1234/);
    expect(fn).not.toThrowError(/fake_gemini_key/);
  });

  it('validateEnv throws naming JWT_SECRET when missing or too short', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_SECRET: 'short',
        Gemini_Key: 'fake_gemini_key',
      }),
    ).toThrowError(/JWT_SECRET/);
  });

  it('validateEnv throws naming GEMINI_API_KEY when neither Gemini_Key nor GEMINI_API_KEY is present', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_SECRET: 'super_secret_key_for_testing_1234',
      }),
    ).toThrowError(/GEMINI_API_KEY/);
  });

  it('validateEnv accepts valid env using Gemini_Key and fills safe defaults', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'super_secret_key_for_testing_1234',
      Gemini_Key: 'fake_gemini_key',
    });
    expect(env.PORT).toBe(4000);
    expect(env.JWT_EXPIRES_IN).toBe('30d');
    expect(env.GEMINI_API_KEY).toBe('fake_gemini_key');
    expect(env.AI_DAILY_MESSAGE_LIMIT).toBe(30);
  });

  it('GET /health and GET /api/v1/health return 200 and standard success envelope', async () => {
    const app = createApp();
    const res1 = await request(app).get('/health');
    expect(res1.status).toBe(200);
    expect(res1.body).toEqual({
      success: true,
      data: { status: 'ok', service: 'stockpilot-api' },
    });

    const res2 = await request(app).get('/api/v1/health');
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({
      success: true,
      data: { status: 'ok', service: 'stockpilot-api' },
    });
  });

  it('connects Prisma to PostgreSQL and executes a smoke query', async () => {
    const prisma = await ensurePrismaConnected();
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    expect(rows[0]?.ok).toBe(1);
  });
});
