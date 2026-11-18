import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/env.js";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PORT: "4000",
  CORS_ORIGINS: "http://localhost:5173,http://localhost:8081",
  DATABASE_URL: "postgresql://user:super_secret_db_pass@localhost:5432/skillconnect",
  JWT_ACCESS_SECRET: "test_access_secret_value_123456",
  JWT_REFRESH_SECRET: "test_refresh_secret_value_123456",
  IMAGEKIT_PUBLIC_KEY: "public_test_key",
  IMAGEKIT_PRIVATE_KEY: "private_super_secret_ik_key",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/test",
  SEED_ADMIN_EMAIL: "admin@example.com",
  SEED_ADMIN_PASSWORD: "AdminPassword123!",
};

describe("loadConfig", () => {
  it("parses valid environment variables and applies default business constants", () => {
    const config = loadConfig(validEnv);
    expect(config.NODE_ENV).toBe("test");
    expect(config.PORT).toBe(4000);
    expect(config.CORS_ORIGINS).toEqual([
      "http://localhost:5173",
      "http://localhost:8081",
    ]);
    expect(config.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
    expect(config.OFFER_EXPIRY_HOURS).toBe(24);
    expect(config.LOCATION_MATCH_RADIUS_KM).toBe(20);
  });

  it("fails fast with missing variable name without printing any secret values", () => {
    const partialEnv = { ...validEnv };
    delete partialEnv.JWT_ACCESS_SECRET;

    let caughtError: Error | undefined;
    try {
      loadConfig(partialEnv);
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError?.message).toContain("JWT_ACCESS_SECRET");
    expect(caughtError?.message).not.toContain("super_secret_db_pass");
    expect(caughtError?.message).not.toContain("test_refresh_secret_value_123456");
    expect(caughtError?.message).not.toContain("private_super_secret_ik_key");
  });
});
