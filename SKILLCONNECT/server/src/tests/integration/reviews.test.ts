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

async function cleanupReviewsTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "rvw-test-" } },
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
  await prisma.providerService.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.serviceArea.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 8 Reviews & Ratings Integration", () => {
  let customer1Token: string;
  let customer2Token: string;
  let providerToken: string;
  let providerProfileId: string;
  let completedBooking1Id: string;
  let completedBooking2Id: string;
  let confirmedBookingId: string;
  let localityLat: number;
  let localityLng: number;

  beforeAll(async () => {
    await cleanupReviewsTestData();

    const suffix = Date.now();
    const cust1Reg = await request(app).post("/api/v1/auth/register").send({
      email: `rvw-test-c1-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Review Customer One",
    });
    customer1Token = cust1Reg.body.data.accessToken;

    const cust2Reg = await request(app).post("/api/v1/auth/register").send({
      email: `rvw-test-c2-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Review Customer Two",
    });
    customer2Token = cust2Reg.body.data.accessToken;

    const provReg = await request(app).post("/api/v1/auth/register").send({
      email: `rvw-test-p-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Review Provider",
    });
    providerToken = provReg.body.data.accessToken;

    await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${providerToken}`);

    const profile = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: provReg.body.data.user.id },
    });
    providerProfileId = profile.id;

    await prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: {
        displayName: `ReviewPro-${suffix}`,
        status: "APPROVED",
        isAcceptingWork: true,
      },
    });

    const cat = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.providerService.create({
      data: {
        providerProfileId,
        categoryId: cat.id,
        title: "Electrical Repair",
        description: "Wiring and breaker repair",
      },
    });

    const loc = await prisma.locality.findFirstOrThrow();
    const coords = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng
      FROM localities WHERE id = ${loc.id}::uuid
    `;
    localityLat = coords[0]!.lat;
    localityLng = coords[0]!.lng;

    await prisma.$executeRaw`
      INSERT INTO service_areas (id, provider_profile_id, locality_id, center, radius_km, created_at, updated_at)
      VALUES (gen_random_uuid(), ${providerProfileId}::uuid, ${loc.id}::uuid, ST_SetSRID(ST_MakePoint(${localityLng}, ${localityLat}), 4326)::geography, 10, NOW(), NOW())
    `;

    const conv1 = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${customer1Token}`)
      .send({ providerProfileId });

    const conv2 = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${customer2Token}`)
      .send({ providerProfileId });

    const createBookingWithStatus = async (
      conversationId: string,
      customerUserId: string,
      status: "COMPLETED" | "CONFIRMED"
    ) => {
      const offer = await prisma.serviceOffer.create({
        data: {
          conversationId,
          providerProfileId,
          customerUserId,
          serviceName: "Electrical Repair",
          description: "Fix main switch",
          price: 1500,
          proposedStart: new Date(Date.now() - 3600_000),
          expiresAt: new Date(Date.now() + 3600_000),
          status: "ACCEPTED",
        },
      });
      const booking = await prisma.booking.create({
        data: {
          offerId: offer.id,
          conversationId,
          customerUserId,
          providerProfileId,
          serviceName: "Electrical Repair",
          description: "Fix main switch",
          price: 1500,
          scheduledStart: new Date(Date.now() - 3600_000),
          serviceAddress: "Main Road",
          status,
          completedAt: status === "COMPLETED" ? new Date() : null,
        },
      });
      return booking.id;
    };

    completedBooking1Id = await createBookingWithStatus(
      conv1.body.data.conversation.id,
      cust1Reg.body.data.user.id,
      "COMPLETED"
    );
    confirmedBookingId = await createBookingWithStatus(
      conv1.body.data.conversation.id,
      cust1Reg.body.data.user.id,
      "CONFIRMED"
    );
    completedBooking2Id = await createBookingWithStatus(
      conv2.body.data.conversation.id,
      cust2Reg.body.data.user.id,
      "COMPLETED"
    );
  });

  afterAll(async () => {
    await cleanupReviewsTestData();
    await prisma.$disconnect();
  });

  it("RVW-1, RVW-2, RVW-3, T10: enforces customer-only, COMPLETED-only, single immutable review", async () => {
    // Provider cannot review
    const provTry = await request(app)
      .post(`/api/v1/bookings/${completedBooking1Id}/review`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ rating: 5 });
    expect(provTry.status).toBe(403);

    // Other customer cannot review
    const otherTry = await request(app)
      .post(`/api/v1/bookings/${completedBooking1Id}/review`)
      .set("Authorization", `Bearer ${customer2Token}`)
      .send({ rating: 5 });
    expect(otherTry.status).toBe(403);

    // Cannot review non-COMPLETED booking (T10)
    const notCompleted = await request(app)
      .post(`/api/v1/bookings/${confirmedBookingId}/review`)
      .set("Authorization", `Bearer ${customer1Token}`)
      .send({ rating: 5 });
    expect(notCompleted.status).toBe(409);

    // Invalid rating rejected
    const badRating = await request(app)
      .post(`/api/v1/bookings/${completedBooking1Id}/review`)
      .set("Authorization", `Bearer ${customer1Token}`)
      .send({ rating: 6 });
    expect(badRating.status).toBe(422);

    // Customer 1 creates review (rating 4)
    const okRes = await request(app)
      .post(`/api/v1/bookings/${completedBooking1Id}/review`)
      .set("Authorization", `Bearer ${customer1Token}`)
      .send({ rating: 4, comment: "Punctual and neat work" });
    expect(okRes.status).toBe(201);
    expect(okRes.body.data.rating).toBe(4);

    // RVW-2: duplicate review rejected
    const dupRes = await request(app)
      .post(`/api/v1/bookings/${completedBooking1Id}/review`)
      .set("Authorization", `Bearer ${customer1Token}`)
      .send({ rating: 5 });
    expect(dupRes.status).toBe(409);

    // RVW-3: no edit/delete endpoints
    const delRes = await request(app)
      .delete(`/api/v1/bookings/${completedBooking1Id}/review`)
      .set("Authorization", `Bearer ${customer1Token}`);
    expect(delRes.status).toBe(404);
  });

  it("RVW-4: computes real averageRating and reviewCount across profile, reviews, and search", async () => {
    // Customer 2 leaves rating 5 -> average of [4, 5] = 4.5
    const res2 = await request(app)
      .post(`/api/v1/bookings/${completedBooking2Id}/review`)
      .set("Authorization", `Bearer ${customer2Token}`)
      .send({ rating: 5, comment: "Great service" });
    expect(res2.status).toBe(201);

    const reviewsRes = await request(app).get(
      `/api/v1/providers/${providerProfileId}/reviews`
    );
    expect(reviewsRes.status).toBe(200);
    expect(reviewsRes.body.data.averageRating).toBe(4.5);
    expect(reviewsRes.body.data.reviewCount).toBe(2);
    expect(reviewsRes.body.data.reviews).toHaveLength(2);

    const profileRes = await request(app).get(
      `/api/v1/providers/${providerProfileId}`
    );
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.profile.averageRating).toBe(4.5);
    expect(profileRes.body.data.profile.reviewCount).toBe(2);

    const searchRes = await request(app)
      .get("/api/v1/providers/search")
      .query({ lat: localityLat, lng: localityLng });
    expect(searchRes.status).toBe(200);
    const found = searchRes.body.data.providers.find(
      (i: { id: string }) => i.id === providerProfileId
    );
    expect(found).toBeDefined();
    expect(found.averageRating).toBe(4.5);
    expect(found.reviewCount).toBe(2);
  });
});
