import "dotenv/config";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import { createOffersService } from "../../modules/offers/offers.service.js";
import { runExpireOffersJob } from "../../jobs/expireOffers.js";

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
const offersService = createOffersService(prisma, config);
const app = createApp({
  config,
  prisma,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
});

async function cleanupOfferBookingData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "ob-test-" } },
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
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 6b Offers & Booking Creation Integration", () => {
  let customerToken: string;
  let customerUserId: string;
  let otherCustomerToken: string;
  let providerToken: string;
  let providerUserId: string;
  let providerProfileId: string;
  let conversationId: string;

  beforeAll(async () => {
    await cleanupOfferBookingData();
  });

  beforeEach(async () => {
    await cleanupOfferBookingData();

    const cRes = await request(app).post("/api/v1/auth/register").send({
      email: `ob-test-c-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Offer Customer",
    });
    customerToken = cRes.body.data.accessToken;
    customerUserId = cRes.body.data.user.id;

    const ocRes = await request(app).post("/api/v1/auth/register").send({
      email: `ob-test-oc-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Other Customer",
    });
    otherCustomerToken = ocRes.body.data.accessToken;

    const pRes = await request(app).post("/api/v1/auth/register").send({
      email: `ob-test-p-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Offer Provider",
    });
    providerToken = pRes.body.data.accessToken;
    providerUserId = pRes.body.data.user.id;

    await prisma.userRole.create({
      data: { userId: providerUserId, role: "PROVIDER" },
    });
    const pp = await prisma.providerProfile.create({
      data: {
        userId: providerUserId,
        displayName: "Ustad Solar",
        status: "APPROVED",
      },
    });
    providerProfileId = pp.id;

    const convRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ providerProfileId });
    conversationId = convRes.body.data.conversation.id;
  });

  afterAll(async () => {
    await cleanupOfferBookingData();
    await prisma.$disconnect();
  });

  const futureStartIso = (hours = 24) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  it("OFR-1, OFR-4, T4: wrong role cannot create offer, new offer supersedes pending atomically, partial unique index blocks two pending offers", async () => {
    // Customer cannot create offer
    const custCreate = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        serviceName: "Fan Fix",
        description: "Replace capacitor and test ceiling fan.",
        pricePkr: 1000,
        proposedStart: futureStartIso(),
      });
    expect(custCreate.status).toBe(403);

    // Provider creates first offer
    const o1 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        serviceName: "Fan Fix",
        description: "Replace capacitor and test ceiling fan.",
        pricePkr: 1000,
        proposedStart: futureStartIso(),
      });
    expect(o1.status).toBe(201);
    const offer1Id = o1.body.data.offer.id as string;

    // Provider creates second offer -> supersedes first atomically (T4)
    const o2 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        serviceName: "Fan Fix + Wiring",
        description: "Replace capacitor, dimmer, and check wiring.",
        pricePkr: 1500,
        proposedStart: futureStartIso(),
      });
    expect(o2.status).toBe(201);

    const oldOffer = await prisma.serviceOffer.findUnique({
      where: { id: offer1Id },
    });
    expect(oldOffer?.status).toBe("SUPERSEDED");

    // Partial unique index directly blocks inserting a second PENDING offer
    await expect(
      prisma.serviceOffer.create({
        data: {
          conversationId,
          providerProfileId,
          customerUserId,
          serviceName: "Duplicate Pending",
          description: "Should fail partial unique index.",
          price: 500,
          proposedStart: new Date(Date.now() + 86_400_000),
          status: "PENDING",
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      })
    ).rejects.toThrow();
  });

  it("OFR-7: accept after expiresAt returns 409 OFFER_EXPIRED even before expiry job runs", async () => {
    const o1 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        serviceName: "Solar Check",
        description: "Inspect solar panels and inverter cables.",
        pricePkr: 2000,
        proposedStart: futureStartIso(24),
      });
    const offerId = o1.body.data.offer.id as string;

    // Backdate expiresAt in DB without running job
    await prisma.serviceOffer.update({
      where: { id: offerId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const acceptRes = await request(app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ serviceAddress: "Main Bazar Road, House 4" });
    expect(acceptRes.status).toBe(409);
    expect(acceptRes.body.error.code).toBe("OFFER_EXPIRED");

    // Expiry job tidies status idempotently
    const expiredCount = await runExpireOffersJob(prisma);
    expect(expiredCount).toBe(1);
    expect(await runExpireOffersJob(prisma)).toBe(0);
  });

  it("BKG-1, BKG-2, BKG-3, BKG-14, BKG-16, T5: atomic accept with rollback on failure, concurrent/repeat accept returns 1 booking, address hidden from lists, and new offer makes separate booking", async () => {
    const o1 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        serviceName: "UPS Installation",
        description: "Install 1000VA UPS and battery wiring.",
        pricePkr: 3500,
        proposedStart: futureStartIso(12),
      });
    const offer1Id = o1.body.data.offer.id as string;

    // Missing address rejected (422) and wrong customer rejected (404)
    expect(
      (
        await request(app)
          .post(`/api/v1/offers/${offer1Id}/accept`)
          .set("Authorization", `Bearer ${customerToken}`)
          .send({})
      ).status
    ).toBe(422);
    expect(
      (
        await request(app)
          .post(`/api/v1/offers/${offer1Id}/accept`)
          .set("Authorization", `Bearer ${otherCustomerToken}`)
          .send({ serviceAddress: "Wrong User Address" })
      ).status
    ).toBe(404);

    // T5: Injected failure rolls back EVERYTHING (offer stays PENDING, 0 bookings, 0 history)
    await expect(
      offersService.acceptOffer(
        offer1Id,
        customerUserId,
        { serviceAddress: "House 12, Street 3" },
        new Date(),
        () => {
          throw new Error("Simulated failure before commit");
        }
      )
    ).rejects.toThrow("Simulated failure before commit");

    expect(
      (await prisma.serviceOffer.findUnique({ where: { id: offer1Id } }))?.status
    ).toBe("PENDING");
    expect(await prisma.booking.count({ where: { offerId: offer1Id } })).toBe(0);

    // BKG-2: Simultaneous accepts yield ONE booking; repeat accept returns same booking with 200
    const [r1, r2] = await Promise.all([
      request(app)
        .post(`/api/v1/offers/${offer1Id}/accept`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ serviceAddress: "House 12, Street 3" }),
      request(app)
        .post(`/api/v1/offers/${offer1Id}/accept`)
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ serviceAddress: "House 12, Street 3" }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.data.booking.id).toBe(r2.body.data.booking.id);
    const booking1Id = r1.body.data.booking.id as string;
    expect(await prisma.booking.count({ where: { offerId: offer1Id } })).toBe(1);

    // BKG-14: History row written atomically
    const history = await prisma.bookingStatusHistory.findMany({
      where: { bookingId: booking1Id },
    });
    expect(history.length).toBe(1);
    expect(history[0]?.toStatus).toBe("CONFIRMED");

    // BKG-3: Address omitted in list, visible in detail to party, hidden from non-party
    const listRes = await request(app)
      .get("/api/v1/bookings")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.bookings[0].serviceAddress).toBeUndefined();

    const detailRes = await request(app)
      .get(`/api/v1/bookings/${booking1Id}`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.booking.serviceAddress).toBe(
      "House 12, Street 3"
    );

    const nonPartyDetail = await request(app)
      .get(`/api/v1/bookings/${booking1Id}`)
      .set("Authorization", `Bearer ${otherCustomerToken}`);
    expect(nonPartyDetail.status).toBe(404);

    // BKG-16: New offer creates a new separate booking (no price editing)
    const o2 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        serviceName: "Extra Inverter Wiring",
        description: "Additional wiring for second room.",
        pricePkr: 1200,
        proposedStart: futureStartIso(24),
      });
    const accept2 = await request(app)
      .post(`/api/v1/offers/${o2.body.data.offer.id}/accept`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ serviceAddress: "House 12, Street 3" });
    expect(accept2.status).toBe(201);
    expect(accept2.body.data.booking.id).not.toBe(booking1Id);
    expect(crypto.randomUUID()).toBeTypeOf("string");
  });
});
