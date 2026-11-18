import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "3000",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/skillconnect",
  JWT_ACCESS_SECRET: "test_access_secret_value_123456",
  JWT_REFRESH_SECRET: "test_refresh_secret_value_123456",
  IMAGEKIT_PUBLIC_KEY: "public_test_key",
  IMAGEKIT_PRIVATE_KEY: "private_test_key",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test",
  SEED_ADMIN_EMAIL: "admin@example.com",
  SEED_ADMIN_PASSWORD: "AdminPassword123!",
});

describe("GET /health", () => {
  it("returns 200 ok when database is reachable", async () => {
    const app = createApp({
      config: testConfig,
      checkDatabase: async () => true,
    });

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        status: "ok",
        environment: "test",
      },
    });
  });

  it("returns 503 when database check fails", async () => {
    const app = createApp({
      config: testConfig,
      checkDatabase: async () => {
        throw new Error("Connection refused");
      },
    });

    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("DB_UNAVAILABLE");
  });
});
