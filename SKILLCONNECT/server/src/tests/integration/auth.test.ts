import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";

const testDbUrl = process.env.Test_DATABASE_URL || process.env.DATABASE_URL;
if (!testDbUrl) {
  throw new Error("Test_DATABASE_URL or DATABASE_URL is required for integration tests");
}

const config = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testDbUrl,
});

const prisma: PrismaClient = createPrismaClient(testDbUrl);
const app = createApp({
  config,
  prisma,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
});

async function resetTestUsers() {
  const adminEmail = config.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const nonAdminUsers = await prisma.user.findMany({
    where: { email: { not: adminEmail }, providerProfile: null },
    select: { id: true },
  });
  const ids = nonAdminUsers.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 1 Auth & Permissions Integration", () => {
  beforeAll(async () => {
    await resetTestUsers();
  });

  beforeEach(async () => {
    await resetTestUsers();
  });

  afterAll(async () => {
    await resetTestUsers();
    await prisma.$disconnect();
  });

  it("AUTH-1, T1: register creates user, CUSTOMER role, and CustomerProfile in one transaction and lowercases email", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "  Ali.Khan@Example.COM ",
      password: "StrongPassword123!",
      fullName: "  Ali Khan  ",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("ali.khan@example.com");
    expect(res.body.data.user.fullName).toBe("Ali Khan");
    expect(res.body.data.user.roles).toEqual(["CUSTOMER"]);
    expect(res.body.data.accessToken).toBeTypeOf("string");
    expect(res.body.data.refreshToken).toBeTypeOf("string");
    // AUTH-7: passwordHash never returned
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const dbUser = await prisma.user.findUnique({
      where: { email: "ali.khan@example.com" },
      include: { roles: true, customerProfile: true },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.roles.map((r) => r.role)).toEqual(["CUSTOMER"]);
    expect(dbUser?.customerProfile).not.toBeNull();
  });

  it("AUTH-1: duplicate email is rejected with 409", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "dup@example.com",
      password: "StrongPassword123!",
      fullName: "First User",
    });

    const dup = await request(app).post("/api/v1/auth/register").send({
      email: "DUP@example.com",
      password: "StrongPassword123!",
      fullName: "Second User",
    });

    expect(dup.status).toBe(409);
    expect(dup.body.success).toBe(false);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("AUTH-1: weak password or password equal to email is rejected with 422", async () => {
    const weak = await request(app).post("/api/v1/auth/register").send({
      email: "weak@example.com",
      password: "short",
      fullName: "Weak Pass",
    });
    expect(weak.status).toBe(422);

    const sameAsEmail = await request(app).post("/api/v1/auth/register").send({
      email: "same@example.com",
      password: "same@example.com",
      fullName: "Same Pass",
    });
    expect(sameAsEmail.status).toBe(422);
  });

  it("AUTH-3: admin role cannot be self-assigned through register", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "hacker@example.com",
      password: "StrongPassword123!",
      fullName: "Hacker",
      role: "ADMIN",
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("AUTH-4: login rate limit returns 429 after 5 failed attempts for same email and IP", async () => {
    await request(app).post("/api/v1/auth/register").send({
      email: "ratelimit@example.com",
      password: "StrongPassword123!",
      fullName: "Rate Limit User",
    });

    for (let i = 0; i < 5; i++) {
      const failRes = await request(app).post("/api/v1/auth/login").send({
        email: "ratelimit@example.com",
        password: "WrongPassword!",
      });
      expect(failRes.status).toBe(401);
    }

    const blockedRes = await request(app).post("/api/v1/auth/login").send({
      email: "ratelimit@example.com",
      password: "WrongPassword!",
    });
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error.code).toBe("RATE_LIMITED");
  });

  it("AUTH-5: suspended user is blocked at login and with an existing valid token", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      email: "suspendme@example.com",
      password: "StrongPassword123!",
      fullName: "Suspend Me",
    });
    const token = reg.body.data.accessToken as string;

    // Suspend user in DB
    await prisma.user.update({
      where: { email: "suspendme@example.com" },
      data: { status: "SUSPENDED", suspendedReason: "Policy violation" },
    });

    // Existing token must be rejected immediately
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(meRes.status).toBe(401);
    expect(meRes.body.error.code).toBe("ACCOUNT_SUSPENDED");

    // Login must also be rejected
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "suspendme@example.com",
      password: "StrongPassword123!",
    });
    expect(loginRes.status).toBe(401);
    expect(loginRes.body.error.code).toBe("ACCOUNT_SUSPENDED");
  });

  it("AUTH-6, T11: refresh rotates tokens and reusing an already-rotated token revokes all user sessions", async () => {
    const reg = await request(app).post("/api/v1/auth/register").send({
      email: "rotate@example.com",
      password: "StrongPassword123!",
      fullName: "Rotate User",
    });
    const firstRefresh = reg.body.data.refreshToken as string;

    const rot1 = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: firstRefresh });
    expect(rot1.status).toBe(200);
    const secondRefresh = rot1.body.data.refreshToken as string;
    expect(secondRefresh).not.toBe(firstRefresh);

    // Reusing firstRefresh triggers reuse detection and revokes secondRefresh too
    const reuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("TOKEN_REUSE_DETECTED");

    const afterReuse = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: secondRefresh });
    expect(afterReuse.status).toBe(401);
  });

  it("AUTH-8: guest is blocked from protected routes and customer is blocked from admin routes", async () => {
    const guestMe = await request(app).get("/api/v1/auth/me");
    expect(guestMe.status).toBe(401);

    const reg = await request(app).post("/api/v1/auth/register").send({
      email: "cust@example.com",
      password: "StrongPassword123!",
      fullName: "Customer User",
    });
    const customerToken = reg.body.data.accessToken as string;

    const custMe = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(custMe.status).toBe(200);
    expect(custMe.body.data.user.passwordHash).toBeUndefined();

    const custAdmin = await request(app)
      .get("/api/v1/admin/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(custAdmin.status).toBe(403);
    expect(custAdmin.body.error.code).toBe("FORBIDDEN");
  });
});
