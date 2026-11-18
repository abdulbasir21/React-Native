import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import {
  karachiDayStartUtc,
  karachiWeekStartUtc,
} from "../../modules/admin/dashboard.service.js";

const testDbUrl = process.env.Test_DATABASE_URL || process.env.DATABASE_URL;
if (!testDbUrl) {
  throw new Error("Test_DATABASE_URL or DATABASE_URL is required");
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

async function cleanupDashboardTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "dash-test-" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 10 Admin Dashboard, Users & Reports Integration", () => {
  let adminToken: string;
  let adminId: string;
  let customerToken: string;
  let customerRefreshToken: string;
  let customerId: string;
  let providerToken: string;

  beforeAll(async () => {
    await cleanupDashboardTestData();
    const suffix = Date.now();

    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: config.SEED_ADMIN_EMAIL.trim().toLowerCase(),
      password: config.SEED_ADMIN_PASSWORD,
    });
    adminToken = adminLogin.body.data.accessToken;
    adminId = adminLogin.body.data.user.id;

    const custReg = await request(app).post("/api/v1/auth/register").send({
      email: `dash-test-c-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Dashboard Customer",
    });
    customerToken = custReg.body.data.accessToken;
    customerRefreshToken = custReg.body.data.refreshToken;
    customerId = custReg.body.data.user.id;

    const provReg = await request(app).post("/api/v1/auth/register").send({
      email: `dash-test-p-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Dashboard Provider",
    });
    providerToken = provReg.body.data.accessToken;
    await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${providerToken}`);
  });

  afterAll(async () => {
    await cleanupDashboardTestData();
    await prisma.$disconnect();
  });

  it("D1: computes Asia/Karachi day and week boundaries accurately", () => {
    // 2026-11-17T20:00:00Z is 2026-11-18T01:00:00+05:00 (Wednesday in Karachi)
    const nowUtc = new Date("2026-11-17T20:00:00.000Z");
    const dayStart = karachiDayStartUtc(nowUtc);
    expect(dayStart.toISOString()).toBe("2026-11-17T19:00:00.000Z"); // 2026-11-18 00:00 PKT

    const weekStart = karachiWeekStartUtc(nowUtc);
    expect(weekStart.toISOString()).toBe("2026-11-15T19:00:00.000Z"); // Monday 2026-11-16 00:00 PKT
  });

  it("ADM-1, ADM-2, ADM-5, AUTH-5: enforces admin-only dashboard, self-protection, and immediate suspension", async () => {
    // Non-admin blocked
    const custDash = await request(app)
      .get("/api/v1/admin/dashboard")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(custDash.status).toBe(403);

    // Admin dashboard works
    const admDash = await request(app)
      .get("/api/v1/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(admDash.status).toBe(200);
    expect(typeof admDash.body.data.dashboard.pendingProviderVerifications).toBe(
      "number"
    );
    expect(Array.isArray(admDash.body.data.dashboard.lateCancellations)).toBe(
      true
    );

    // Cannot suspend self
    const selfSuspend = await request(app)
      .post(`/api/v1/admin/users/${adminId}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(selfSuspend.status).toBe(400);

    // Admin suspends customer -> immediate block (AUTH-5)
    const suspRes = await request(app)
      .post(`/api/v1/admin/users/${customerId}/suspend`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Policy violation" });
    expect(suspRes.status).toBe(200);
    expect(suspRes.body.data.user.status).toBe("SUSPENDED");

    const blockedMe = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(blockedMe.status).toBe(401);

    const blockedRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: customerRefreshToken });
    expect(blockedRefresh.status).toBe(401);

    // Reinstate customer -> access restored
    const reinRes = await request(app)
      .post(`/api/v1/admin/users/${customerId}/reinstate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(reinRes.status).toBe(200);
    expect(reinRes.body.data.user.status).toBe("ACTIVE");

    const restoredMe = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(restoredMe.status).toBe(200);
  });

  it("Provider dashboard returns stats for provider and 403 for customer", async () => {
    const custTry = await request(app)
      .get("/api/v1/provider/me/dashboard")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(custTry.status).toBe(403);

    const provRes = await request(app)
      .get("/api/v1/provider/me/dashboard")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(provRes.status).toBe(200);
    expect(provRes.body.data.dashboard.totalBookings).toBe(0);
    expect(provRes.body.data.dashboard.reviewCount).toBe(0);
  });
});
