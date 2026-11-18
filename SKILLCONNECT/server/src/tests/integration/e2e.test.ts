import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";

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

async function cleanupE2EData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "e2e-test-" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  const convs = await prisma.conversation.findMany({
    where: {
      OR: [
        { customerUserId: { in: ids } },
        { providerProfile: { userId: { in: ids } } },
      ],
    },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  if (convIds.length > 0) {
    const bookings = await prisma.booking.findMany({
      where: { conversationId: { in: convIds } },
      select: { id: true },
    });
    const bIds = bookings.map((b) => b.id);
    if (bIds.length > 0) {
      await prisma.review.deleteMany({ where: { bookingId: { in: bIds } } });
      await prisma.dispute.deleteMany({ where: { bookingId: { in: bIds } } });
      await prisma.bookingStatusHistory.deleteMany({
        where: { bookingId: { in: bIds } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: bIds } } });
    }
    await prisma.serviceOffer.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
  }

  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.providerVerification.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.providerService.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.serviceArea.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.availabilityWindow.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 11 End-to-End Flow & Security Matrix", () => {
  let adminToken: string;

  beforeAll(async () => {
    await cleanupE2EData();
    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: config.SEED_ADMIN_EMAIL.trim().toLowerCase(),
      password: config.SEED_ADMIN_PASSWORD,
    });
    adminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await cleanupE2EData();
    await prisma.$disconnect();
  });

  it("completes full marketplace lifecycle: onboard -> approve -> search -> chat -> offer -> booking -> complete -> review", async () => {
    const suffix = Date.now();
    const custReg = await request(app).post("/api/v1/auth/register").send({
      email: `e2e-test-c-${suffix}@example.com`,
      password: "Password123!",
      fullName: "E2E Customer",
    });
    expect(custReg.status).toBe(201);
    const custToken = custReg.body.data.accessToken;

    const provReg = await request(app).post("/api/v1/auth/register").send({
      email: `e2e-test-p-${suffix}@example.com`,
      password: "Password123!",
      fullName: "E2E Provider",
    });
    expect(provReg.status).toBe(201);
    const provToken = provReg.body.data.accessToken;

    // 1. Provider onboarding & submission
    const onb = await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${provToken}`);
    expect(onb.status).toBe(201);
    const providerProfileId = onb.body.data.profile.id;

    const cat = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const loc = await prisma.locality.findFirstOrThrow({
      where: { isServiceable: true },
    });
    const coords = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng
      FROM localities WHERE id = ${loc.id}::uuid
    `;
    const lat = coords[0]!.lat;
    const lng = coords[0]!.lng;

    const profUpdate = await request(app)
      .put("/api/v1/provider/me/profile")
      .set("Authorization", `Bearer ${provToken}`)
      .send({
        displayName: `E2E Technician ${suffix}`,
        description:
          "Experienced repair specialist with five years of residential and commercial service.",
        experienceYears: 5,
        isAcceptingWork: true,
        photoUrl: "https://ik.imagekit.io/demo/default-image.jpg",
        photoFileId: "e2e-photo-1",
      });
    expect(profUpdate.status).toBe(200);

    await request(app)
      .put("/api/v1/provider/me/services")
      .set("Authorization", `Bearer ${provToken}`)
      .send({
        services: [
          {
            categoryId: cat.id,
            title: "Full AC Service",
            description: "Cleaning and gas check",
          },
        ],
      });

    await request(app)
      .put("/api/v1/provider/me/service-area")
      .set("Authorization", `Bearer ${provToken}`)
      .send({
        localityId: loc.id,
        lat,
        lng,
        radiusKm: 10,
      });

    const submit = await request(app)
      .post("/api/v1/provider/me/submit")
      .set("Authorization", `Bearer ${provToken}`);
    expect(submit.status).toBe(200);

    // 2. Admin approves provider
    const approve = await request(app)
      .post(`/api/v1/admin/providers/${providerProfileId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "APPROVED" });
    expect(approve.status).toBe(200);

    // 3. Customer searches nearby & measures latency
    const startMs = Date.now();
    const search = await request(app)
      .get("/api/v1/providers/search")
      .query({ lat, lng });
    const elapsedMs = Date.now() - startMs;
    expect(search.status).toBe(200);
    expect(elapsedMs).toBeLessThan(5000);
    const found = search.body.data.providers.find(
      (p: { id: string }) => p.id === providerProfileId
    );
    expect(found).toBeDefined();

    // 4. Customer opens conversation & sends message
    const convRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${custToken}`)
      .send({ providerProfileId });
    expect(convRes.status).toBe(200);
    const conversationId = convRes.body.data.conversation.id;

    const msgRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${custToken}`)
      .send({
        type: "TEXT",
        body: "Can you come now?",
        clientMessageId: `e2e-msg-${suffix}`,
      });
    expect(msgRes.status).toBe(201);

    // 5. Provider sends offer -> Customer accepts
    const offerRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${provToken}`)
      .send({
        serviceName: "Full AC Service",
        description: "Standard AC cleaning and gas pressure check",
        pricePkr: 2000,
        proposedStart: new Date(Date.now() + 3600_000).toISOString(),
      });
    expect(offerRes.status).toBe(201);
    const offerId = offerRes.body.data.offer.id;

    const acceptRes = await request(app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${custToken}`)
      .send({ serviceAddress: "House 4, Main Bazaar" });
    expect(acceptRes.status).toBe(201);
    const bookingId = acceptRes.body.data.booking.id;

    // Advance clock past scheduledStart so provider can mark complete
    await prisma.booking.update({
      where: { id: bookingId },
      data: { scheduledStart: new Date(Date.now() - 60_000) },
    });

    // 6. Provider completes -> Customer confirms
    const compRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set("Authorization", `Bearer ${provToken}`);
    expect(compRes.status).toBe(200);

    const confRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set("Authorization", `Bearer ${custToken}`);
    expect(confRes.status).toBe(200);
    expect(confRes.body.data.booking.status).toBe("COMPLETED");

    // 7. Customer leaves review -> reflected on profile
    const revRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/review`)
      .set("Authorization", `Bearer ${custToken}`)
      .send({ rating: 5, comment: "Excellent work" });
    expect(revRes.status).toBe(201);

    const profRes = await request(app).get(
      `/api/v1/providers/${providerProfileId}`
    );
    expect(profRes.status).toBe(200);
    expect(profRes.body.data.profile.averageRating).toBe(5);
    expect(profRes.body.data.profile.reviewCount).toBe(1);
  });

  it("AUTH-8: rejects unauthenticated access to protected routes", async () => {
    const endpoints = [
      ["get", "/api/v1/auth/me"],
      ["get", "/api/v1/conversations"],
      ["get", "/api/v1/bookings"],
      ["get", "/api/v1/notifications"],
      ["get", "/api/v1/provider/me/profile"],
      ["get", "/api/v1/admin/dashboard"],
      ["get", "/api/v1/admin/users"],
    ] as const;

    for (const [method, path] of endpoints) {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    }
  });
});
