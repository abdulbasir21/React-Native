import "dotenv/config";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import { createDiscoveryRepository } from "../../modules/discovery/discovery.repository.js";

const testDbUrl = process.env.Test_DATABASE_URL || process.env.DATABASE_URL;
if (!testDbUrl) {
  throw new Error("Test_DATABASE_URL or DATABASE_URL is required");
}

const config = loadConfig({ ...process.env, NODE_ENV: "test", DATABASE_URL: testDbUrl });
const prisma: PrismaClient = createPrismaClient(testDbUrl);
const repo = createDiscoveryRepository(prisma);
const app = createApp({
  config,
  prisma,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
});

async function cleanupDiscoveryData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "dsc-test-" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    const profiles = await prisma.providerProfile.findMany({
      where: { userId: { in: ids } },
      select: { id: true },
    });
    const pIds = profiles.map((p) => p.id);
    if (pIds.length > 0) {
      await prisma.availabilityWindow.deleteMany({
        where: { providerProfileId: { in: pIds } },
      });
      await prisma.providerService.deleteMany({
        where: { providerProfileId: { in: pIds } },
      });
      await prisma.serviceArea.deleteMany({
        where: { providerProfileId: { in: pIds } },
      });
      await prisma.providerProfile.deleteMany({ where: { id: { in: pIds } } });
    }
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.category.deleteMany({ where: { slug: { startsWith: "dsc-cat-" } } });
  await prisma.$executeRaw`DELETE FROM localities WHERE slug LIKE 'dsc-loc-%'`;
}

describe("Phase 4a Discovery PostGIS Queries Integration", () => {
  let activeCatId: string;
  let inactiveCatId: string;
  let localityId: string;
  let approvedNearId: string;
  let approvedFarId: string;
  let approvedInactiveCatId: string;
  let pendingId: string;
  let suspendedUserProvId: string;

  beforeAll(async () => {
    await cleanupDiscoveryData();

    const activeCat = await prisma.category.create({
      data: {
        name: "Discovery Plumber",
        slug: `dsc-cat-active-${Date.now()}`,
        iconKey: "plumbing",
        isActive: true,
      },
    });
    activeCatId = activeCat.id;

    const inactiveCat = await prisma.category.create({
      data: {
        name: "Discovery Hidden Trade",
        slug: `dsc-cat-inactive-${Date.now()}`,
        iconKey: "build",
        isActive: false,
      },
    });
    inactiveCatId = inactiveCat.id;

    localityId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO localities (id, parent_id, level, name, slug, center, is_serviceable, created_at, updated_at)
      VALUES (
        ${localityId}::uuid,
        NULL,
        'PROVINCE'::"LocalityLevel",
        'Test Search Area',
        ${"dsc-loc-" + Date.now()},
        ST_SetSRID(ST_MakePoint(72.4849, 34.5106), 4326)::geography,
        true,
        NOW(),
        NOW()
      )
    `;

    async function seedProvider(opts: {
      tag: string;
      displayName: string;
      userStatus: "ACTIVE" | "SUSPENDED";
      providerStatus: "APPROVED" | "PENDING" | "REJECTED" | "SUSPENDED";
      catId: string;
      serviceTitle: string;
      lat: number;
      lng: number;
      radiusKm: number;
      isAcceptingWork?: boolean;
    }) {
      const user = await prisma.user.create({
        data: {
          email: `dsc-test-${opts.tag}-${Date.now()}@example.com`,
          passwordHash: "hash",
          fullName: opts.displayName,
          status: opts.userStatus,
          roles: { create: [{ role: "PROVIDER" }] },
        },
      });
      const pp = await prisma.providerProfile.create({
        data: {
          userId: user.id,
          displayName: opts.displayName,
          description: "Test technician profile description over thirty chars.",
          experienceYears: 5,
          status: opts.providerStatus,
          isAcceptingWork: opts.isAcceptingWork ?? true,
        },
      });
      await prisma.providerService.create({
        data: {
          providerProfileId: pp.id,
          categoryId: opts.catId,
          title: opts.serviceTitle,
          description: "Detailed test service description.",
        },
      });
      await prisma.$executeRaw`
        INSERT INTO service_areas (id, provider_profile_id, locality_id, center, radius_km, created_at, updated_at)
        VALUES (
          ${crypto.randomUUID()}::uuid,
          ${pp.id}::uuid,
          ${localityId}::uuid,
          ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
          ${opts.radiusKm},
          NOW(),
          NOW()
        )
      `;
      return pp.id;
    }

    // Search origin will be (34.5106, 72.4849)
    // 1) Near (~300m away) -> Under 1 km
    approvedNearId = await seedProvider({
      tag: "near",
      displayName: "Usman Solar & Pipe",
      userStatus: "ACTIVE",
      providerStatus: "APPROVED",
      catId: activeCatId,
      serviceTitle: "Water Pipe Repair",
      lat: 34.513,
      lng: 72.485,
      radiusKm: 10,
    });

    // 2) Outside radius (15 km away, radiusKm = 5)
    approvedFarId = await seedProvider({
      tag: "far",
      displayName: "Far Technician",
      userStatus: "ACTIVE",
      providerStatus: "APPROVED",
      catId: activeCatId,
      serviceTitle: "Pipe Fitting",
      lat: 34.65,
      lng: 72.485,
      radiusKm: 5,
    });

    // 3) Inactive category only
    approvedInactiveCatId = await seedProvider({
      tag: "inact",
      displayName: "Hidden Category Tech",
      userStatus: "ACTIVE",
      providerStatus: "APPROVED",
      catId: inactiveCatId,
      serviceTitle: "Inactive Work",
      lat: 34.511,
      lng: 72.485,
      radiusKm: 10,
    });

    // 4) Pending provider
    pendingId = await seedProvider({
      tag: "pend",
      displayName: "Pending Tech",
      userStatus: "ACTIVE",
      providerStatus: "PENDING",
      catId: activeCatId,
      serviceTitle: "Pipe Fitting",
      lat: 34.511,
      lng: 72.485,
      radiusKm: 10,
    });

    // 5) Suspended user
    suspendedUserProvId = await seedProvider({
      tag: "susp",
      displayName: "Suspended User Tech",
      userStatus: "SUSPENDED",
      providerStatus: "APPROVED",
      catId: activeCatId,
      serviceTitle: "Pipe Fitting",
      lat: 34.511,
      lng: 72.485,
      radiusKm: 10,
    });
  });

  afterAll(async () => {
    await cleanupDiscoveryData();
    await prisma.$disconnect();
  });

  it("DSC-1, DSC-2, DSC-4, PRV-7: excludes non-approved, suspended, inactive-category, and out-of-radius providers and formats Under 1 km", async () => {
    const res = await repo.searchProviders(
      {
        lat: 34.5106,
        lng: 72.4849,
        availableNow: false,
        sort: "distance",
        limit: 20,
        offset: 0,
      },
      new Date(),
      new Map([[approvedNearId, [5, 4]]])
    );

    const ids = res.items.map((i) => i.id);
    expect(ids).toContain(approvedNearId);
    expect(ids).not.toContain(approvedFarId);
    expect(ids).not.toContain(approvedInactiveCatId);
    expect(ids).not.toContain(pendingId);
    expect(ids).not.toContain(suspendedUserProvId);

    const near = res.items.find((i) => i.id === approvedNearId)!;
    expect(near.distanceLabel).toBe("Under 1 km");
    expect(near.averageRating).toBe(4.5);
    expect((near as unknown as Record<string, unknown>).lat).toBeUndefined();
    expect((near as unknown as Record<string, unknown>).lng).toBeUndefined();

    // DSC-4: case-insensitive substring match on service title
    const qMatch = await repo.searchProviders({
      lat: 34.5106,
      lng: 72.4849,
      q: "water pipe",
      availableNow: false,
      sort: "distance",
      limit: 20,
      offset: 0,
    });
    expect(qMatch.items.some((i) => i.id === approvedNearId)).toBe(true);

    const qMiss = await repo.searchProviders({
      lat: 34.5106,
      lng: 72.4849,
      q: "nonexistent-keyword-xyz",
      availableNow: false,
      sort: "distance",
      limit: 20,
      offset: 0,
    });
    expect(qMiss.items).toEqual([]);
  });

  it("Phase 4b endpoints: guest search, pagination D7 max 50, PRV-7 privacy, and PRV-3 404 for pending profile", async () => {
    const guestSearch = await request(app)
      .get("/api/v1/providers/search")
      .query({ lat: 34.5106, lng: 72.4849, limit: 10 });
    expect(guestSearch.status).toBe(200);
    expect(guestSearch.body.meta.limit).toBe(10);
    const providers = guestSearch.body.data.providers as Record<string, unknown>[];
    expect(providers.some((p) => p.id === approvedNearId)).toBe(true);
    expect(providers.some((p) => p.id === pendingId)).toBe(false);
    for (const p of providers) {
      expect(p.lat).toBeUndefined();
      expect(p.lng).toBeUndefined();
    }

    // D7: limit > 50 rejected
    const badLimit = await request(app)
      .get("/api/v1/providers/search")
      .query({ lat: 34.5106, lng: 72.4849, limit: 51 });
    expect(badLimit.status).toBe(422);

    // Public profile 200 for approved, 404 for pending
    const pubOk = await request(app).get(`/api/v1/providers/${approvedNearId}`);
    expect(pubOk.status).toBe(200);
    expect(pubOk.body.data.profile.serviceArea.lat).toBeUndefined();

    const pubPending = await request(app).get(`/api/v1/providers/${pendingId}`);
    expect(pubPending.status).toBe(404);
  });
});
