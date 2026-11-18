import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import {
  runAutoCompleteJob,
  runNoShowDeadlineJob,
} from "../../jobs/bookingLifecycleJobs.js";

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

async function cleanupLifecycleData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "lc-test-" } },
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
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 7b Booking Lifecycle & Disputes Integration", () => {
  let adminToken: string;
  let customerToken: string;
  let providerToken: string;
  let outsiderToken: string;
  let providerProfileId: string;
  let conversationId: string;

  beforeAll(async () => {
    await cleanupLifecycleData();
    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: config.SEED_ADMIN_EMAIL.trim().toLowerCase(),
      password: config.SEED_ADMIN_PASSWORD,
    });
    adminToken = adminLogin.body.data.accessToken;
  });

  beforeEach(async () => {
    await cleanupLifecycleData();

    const cRes = await request(app).post("/api/v1/auth/register").send({
      email: `lc-test-c-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Lifecycle Customer",
    });
    customerToken = cRes.body.data.accessToken;

    const pRes = await request(app).post("/api/v1/auth/register").send({
      email: `lc-test-p-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Lifecycle Provider",
    });
    providerToken = pRes.body.data.accessToken;
    const providerUserId = pRes.body.data.user.id as string;
    await prisma.userRole.create({
      data: { userId: providerUserId, role: "PROVIDER" },
    });
    const pp = await prisma.providerProfile.create({
      data: {
        userId: providerUserId,
        displayName: "Lifecycle Pro",
        status: "APPROVED",
      },
    });
    providerProfileId = pp.id;

    const oRes = await request(app).post("/api/v1/auth/register").send({
      email: `lc-test-o-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: "Lifecycle Outsider",
    });
    outsiderToken = oRes.body.data.accessToken;

    const convRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ providerProfileId });
    conversationId = convRes.body.data.conversation.id;
  });

  afterAll(async () => {
    await cleanupLifecycleData();
    await prisma.$disconnect();
  });

  async function createConfirmedBooking(scheduledOffsetMs: number) {
    const offerRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/offers`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        serviceName: "AC Gas Refill",
        description: "Check pressure and refill AC refrigerant.",
        pricePkr: 4000,
        proposedStart: new Date(Date.now() + 12 * 3600_000).toISOString(),
      });
    const acceptRes = await request(app)
      .post(`/api/v1/offers/${offerRes.body.data.offer.id}/accept`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ serviceAddress: "Main Road, Block B" });
    const bookingId = acceptRes.body.data.booking.id as string;

    await prisma.booking.update({
      where: { id: bookingId },
      data: { scheduledStart: new Date(Date.now() + scheduledOffsetMs) },
    });
    return bookingId;
  }

  it("BKG-5, BKG-6, BKG-14, ADM-4: complete -> confirm flow, rejects early complete, wrong role, and admin actions", async () => {
    // Scheduled 2 hours in the future -> complete blocked
    const bookingId = await createConfirmedBooking(2 * 3600_000);

    const earlyComplete = await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(earlyComplete.status).toBe(409);

    // Move scheduledStart to 5 min ago
    await prisma.booking.update({
      where: { id: bookingId },
      data: { scheduledStart: new Date(Date.now() - 5 * 60_000) },
    });

    // Customer cannot mark complete (403); outsider gets 404; admin cannot create booking/message (ADM-4 -> 403)
    expect(
      (
        await request(app)
          .post(`/api/v1/bookings/${bookingId}/complete`)
          .set("Authorization", `Bearer ${customerToken}`)
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/bookings/${bookingId}/complete`)
          .set("Authorization", `Bearer ${outsiderToken}`)
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/conversations/${conversationId}/offers`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            serviceName: "Admin Offer",
            description: "Not allowed for admin.",
            pricePkr: 500,
            proposedStart: new Date(Date.now() + 86_400_000).toISOString(),
          })
      ).status
    ).toBe(404);

    // Provider completes -> PROVIDER_COMPLETED
    const comp = await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(comp.status).toBe(200);
    expect(comp.body.data.booking.status).toBe("PROVIDER_COMPLETED");

    // Customer confirms -> COMPLETED
    const conf = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(conf.status).toBe(200);
    expect(conf.body.data.booking.status).toBe("COMPLETED");
    expect(conf.body.data.booking.history.length).toBe(3);

    // Final state rejects further cancel
    const cancelFinal = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ reason: "Too late to cancel" });
    expect(cancelFinal.status).toBe(409);
  });

  it("BKG-12, BKG-13, ADM-3, T8, T9: report issue -> admin reads conversation ONLY while dispute active -> resolve closes access", async () => {
    const bookingId = await createConfirmedBooking(-3600_000);
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set("Authorization", `Bearer ${providerToken}`);

    const issueRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/issue`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ reason: "AC cooling stopped working after 10 minutes." });
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.data.booking.status).toBe("DISPUTED");
    const disputeId = issueRes.body.data.booking.activeDispute.id as string;

    // ADM-3: Admin can read conversation while dispute is active
    const convWhileActive = await request(app)
      .get(`/api/v1/admin/disputes/${disputeId}/conversation`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(convWhileActive.status).toBe(200);

    // T9: Admin resolves dispute
    const resolveRes = await request(app)
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        outcome: "COMPLETED",
        resolutionNote: "Verified work completed properly with customer.",
      });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.dispute.status).toBe("RESOLVED");

    // ADM-3: Conversation read returns 404 after resolution
    const convAfterResolve = await request(app)
      .get(`/api/v1/admin/disputes/${disputeId}/conversation`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(convAfterResolve.status).toBe(404);
  });

  it("BKG-7, BKG-10, BKG-11: auto-complete job & no-show deadline job are idempotent", async () => {
    // 1) Auto-complete candidate (completed 49h ago)
    const b1 = await createConfirmedBooking(-50 * 3600_000);
    await prisma.booking.update({
      where: { id: b1 },
      data: {
        status: "PROVIDER_COMPLETED",
        providerCompletedAt: new Date(Date.now() - 49 * 3600_000),
      },
    });
    expect(await runAutoCompleteJob(prisma, config)).toBe(1);
    expect(await runAutoCompleteJob(prisma, config)).toBe(0);
    expect(
      (await prisma.booking.findUnique({ where: { id: b1 } }))?.status
    ).toBe("COMPLETED");

    // 2) No-show reported after grace, deadline passes -> job finalises idempotently
    const b2 = await createConfirmedBooking(-90 * 60_000);
    const nsRes = await request(app)
      .post(`/api/v1/bookings/${b2}/no-show`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ reason: "Technician did not arrive." });
    expect(nsRes.status).toBe(200);
    expect(nsRes.body.data.booking.status).toBe("NO_SHOW_REPORTED");

    await prisma.dispute.updateMany({
      where: { bookingId: b2 },
      data: { responseDeadline: new Date(Date.now() - 60_000) },
    });
    expect(await runNoShowDeadlineJob(prisma)).toBe(1);
    expect(await runNoShowDeadlineJob(prisma)).toBe(0);
    expect(
      (await prisma.booking.findUnique({ where: { id: b2 } }))?.status
    ).toBe("NO_SHOW_PROVIDER");
  });
});
