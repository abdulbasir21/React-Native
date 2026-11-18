import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import {
  dispatchPushNotifications,
  sanitizePushMessagePreview,
} from "../../modules/notifications/notifications.service.js";

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

async function cleanupNotificationsTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "ntf-test-" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  await prisma.pushToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 9 Notifications & Push Integration", () => {
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let notification1Id: string;

  beforeAll(async () => {
    await cleanupNotificationsTestData();
    const suffix = Date.now();

    const u1 = await request(app).post("/api/v1/auth/register").send({
      email: `ntf-test-1-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Notify User One",
    });
    user1Token = u1.body.data.accessToken;
    user1Id = u1.body.data.user.id;

    const u2 = await request(app).post("/api/v1/auth/register").send({
      email: `ntf-test-2-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Notify User Two",
    });
    user2Token = u2.body.data.accessToken;

    const n1 = await prisma.notification.create({
      data: {
        userId: user1Id,
        type: "BOOKING_CONFIRMED",
        title: "Booking confirmed",
        body: "Your booking is confirmed.",
      },
    });
    notification1Id = n1.id;

    await prisma.notification.create({
      data: {
        userId: user1Id,
        type: "NEW_MESSAGE",
        title: "New message",
        body: "Hello there",
      },
    });
  });

  afterAll(async () => {
    await cleanupNotificationsTestData();
    await prisma.$disconnect();
  });

  it("NTF-1: lists notifications, enforces ownership on markRead, and supports read-all", async () => {
    const listRes = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${user1Token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.notifications).toHaveLength(2);
    expect(listRes.body.data.unreadCount).toBe(2);

    // Wrong owner cannot mark read -> 404
    const wrongOwner = await request(app)
      .post(`/api/v1/notifications/${notification1Id}/read`)
      .set("Authorization", `Bearer ${user2Token}`);
    expect(wrongOwner.status).toBe(404);

    // Owner marks one read
    const markOne = await request(app)
      .post(`/api/v1/notifications/${notification1Id}/read`)
      .set("Authorization", `Bearer ${user1Token}`);
    expect(markOne.status).toBe(200);
    expect(markOne.body.data.notification.isRead).toBe(true);

    // Owner marks all read
    const markAll = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${user1Token}`);
    expect(markAll.status).toBe(200);
    expect(markAll.body.data.updatedCount).toBe(1);
  });

  it("NTF-2: sanitizes push message previews for TEXT (<= 80 chars) and IMAGE ('Photo')", () => {
    expect(sanitizePushMessagePreview("IMAGE", "https://example.com/a.jpg")).toBe(
      "Photo"
    );
    const longText = "A".repeat(120);
    const preview = sanitizePushMessagePreview("TEXT", longText);
    expect(preview.length).toBe(80);
    expect(preview.endsWith("...")).toBe(true);
  });

  it("NTF-3, NTF-4: registers push tokens, never fails on push error, and deletes DeviceNotRegistered tokens", async () => {
    const validToken = "ExponentPushToken[valid_test_token_12345]";
    const deadToken = "ExponentPushToken[dead_test_token_67890]";

    const r1 = await request(app)
      .post("/api/v1/notifications/push-token")
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ expoPushToken: validToken, platform: "android" });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post("/api/v1/notifications/push-token")
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ expoPushToken: deadToken, platform: "android" });
    expect(r2.status).toBe(201);

    // NTF-3: Throwing sender does not throw out of dispatchPushNotifications
    const failRes = await dispatchPushNotifications(
      prisma,
      { userId: user1Id, title: "Test", body: "Hello" },
      async () => {
        throw new Error("Expo network error");
      }
    );
    expect(failRes.sent).toBe(0);

    // NTF-4: DeviceNotRegistered ticket deletes only the dead token
    const dispatchRes = await dispatchPushNotifications(
      prisma,
      { userId: user1Id, title: "Test", body: "Hello" },
      async (msgs) =>
        msgs.map((m) =>
          m.to === deadToken
            ? {
                status: "error" as const,
                message: "not registered",
                details: { error: "DeviceNotRegistered" as const },
              }
            : { status: "ok" as const, id: "ticket-1" }
        )
    );
    expect(dispatchRes.sent).toBe(1);
    expect(dispatchRes.removedTokens).toBe(1);

    const remaining = await prisma.pushToken.findMany({
      where: { userId: user1Id },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.expoPushToken).toBe(validToken);

    // Delete remaining token via endpoint
    const delRes = await request(app)
      .delete("/api/v1/notifications/push-token")
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ expoPushToken: validToken });
    expect(delRes.status).toBe(200);
  });
});
