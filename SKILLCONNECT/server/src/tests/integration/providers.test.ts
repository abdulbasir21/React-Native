import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { loadConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { createPrismaClient } from "../../lib/prisma.js";
import type { ImageStorageAdapter } from "../../lib/upload.js";

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

let shouldThrowOnDelete = false;
const deletedFileIds: string[] = [];

const mockStorage: ImageStorageAdapter = {
  async upload(_buffer, fileName) {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { url: `https://ik.imagekit.io/test/${fileId}-${fileName}`, fileId };
  },
  async deleteBestEffort(fileId) {
    deletedFileIds.push(fileId);
    if (shouldThrowOnDelete) {
      // Simulate real adapter behavior: best-effort catches external error and never throws to caller
      try {
        throw new Error("ImageKit unavailable");
      } catch {
        return;
      }
    }
  },
};

const app = createApp({
  config,
  prisma,
  imageStorage: mockStorage,
  uploadLimitPerHour: 5,
  checkDatabase: async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
});

// Minimal valid 1x1 PNG bytes
const VALID_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

async function getAdminToken(): Promise<string> {
  const email = config.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: config.SEED_ADMIN_PASSWORD,
  });
  return login.body.data.accessToken as string;
}

async function cleanupProviderTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "prv-test-" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  const profiles = await prisma.providerProfile.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const pIds = profiles.map((p) => p.id);

  if (pIds.length > 0) {
    await prisma.providerVerification.deleteMany({
      where: { providerProfileId: { in: pIds } },
    });
    await prisma.portfolioMedia.deleteMany({
      where: { providerProfileId: { in: pIds } },
    });
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

  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Phase 3 Provider Onboarding, Uploads & Approval Integration", () => {
  let adminToken: string;
  let categoryId: string;
  let localityId: string;

  beforeAll(async () => {
    adminToken = await getAdminToken();

    const cat = await prisma.category.findFirst({ where: { isActive: true } });
    if (cat) {
      categoryId = cat.id;
    } else {
      const created = await prisma.category.create({
        data: {
          name: "Test Electric",
          slug: `test-prv-cat-${Date.now()}`,
          iconKey: "bolt",
          isActive: true,
        },
      });
      categoryId = created.id;
    }

    const loc = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM localities WHERE is_serviceable = true LIMIT 1
    `;
    if (loc[0]) {
      localityId = loc[0].id;
    } else {
      const created = await request(app)
        .post("/api/v1/admin/localities")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Test Hub",
          slug: `test-prv-loc-${Date.now()}`,
          level: "PROVINCE",
          parentId: null,
          lat: 34.5,
          lng: 72.5,
          isServiceable: true,
        });
      localityId = created.body.data.locality.id;
    }
  });

  beforeEach(async () => {
    shouldThrowOnDelete = false;
    deletedFileIds.length = 0;
    await cleanupProviderTestData();
  });

  afterAll(async () => {
    await cleanupProviderTestData();
    await prisma.$disconnect();
  });

  async function registerUser(tag: string) {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: `prv-test-${tag}-${Date.now()}@example.com`,
      password: "StrongPassword123!",
      fullName: `Provider ${tag}`,
    });
    return {
      token: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  it("AUTH-2, T2, PRV-1, PRV-2, PRV-3: onboarding creates PROVIDER role, validates submission, enforces PRV-3 404 visibility", async () => {
    const providerUser = await registerUser("main");
    const bystander = await registerUser("bystander");

    const beforeOnboard = await request(app)
      .get("/api/v1/provider/me/profile")
      .set("Authorization", `Bearer ${providerUser.token}`);
    expect(beforeOnboard.status).toBe(403);

    const onboard = await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({});
    expect(onboard.status).toBe(201);
    const providerId = onboard.body.data.profile.id as string;
    expect(onboard.body.data.profile.status).toBe("DRAFT");

    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${providerUser.token}`);
    expect(meRes.body.data.user.roles).toContain("CUSTOMER");
    expect(meRes.body.data.user.roles).toContain("PROVIDER");

    const badSubmit = await request(app)
      .post("/api/v1/provider/me/submit")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({});
    expect(badSubmit.status).toBe(422);

    await Promise.all([
      request(app)
        .put("/api/v1/provider/me/profile")
        .set("Authorization", `Bearer ${providerUser.token}`)
        .send({
          displayName: "Ustad Tariq Wiring",
          photoUrl: "https://ik.imagekit.io/test/avatar.png",
          photoFileId: "avatar-file-1",
          description:
            "Experienced residential and commercial electrical installation specialist.",
          experienceYears: 8,
        }),
      request(app)
        .put("/api/v1/provider/me/services")
        .set("Authorization", `Bearer ${providerUser.token}`)
        .send({
          services: [
            {
              categoryId,
              title: "Home Wiring & Breaker Fix",
              description:
                "Complete house wiring inspection and circuit breaker repair.",
            },
          ],
        }),
      request(app)
        .put("/api/v1/provider/me/service-area")
        .set("Authorization", `Bearer ${providerUser.token}`)
        .send({ localityId, lat: 34.5106, lng: 72.4849, radiusKm: 15 }),
    ]);

    const submitOk = await request(app)
      .post("/api/v1/provider/me/submit")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({});
    expect(submitOk.status).toBe(200);
    expect(submitOk.body.data.profile.status).toBe("PENDING");

    // PRV-3: Non-approved profile returns 404 to guest & bystander, 200 to owner
    expect(
      (await request(app).get(`/api/v1/providers/${providerId}`)).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/providers/${providerId}`)
          .set("Authorization", `Bearer ${bystander.token}`)
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/v1/providers/${providerId}`)
          .set("Authorization", `Bearer ${providerUser.token}`)
      ).status
    ).toBe(200);
  });

  it("PRV-4, T3, PRV-5, PRV-6, PRV-7: reject/resubmit, approve, edit preserves status, suspend hides profile, and public response omits center coordinates", async () => {
    const providerUser = await registerUser("review");
    const bystander = await registerUser("bystander2");

    const onboard = await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({});
    const providerId = onboard.body.data.profile.id as string;

    await Promise.all([
      request(app)
        .put("/api/v1/provider/me/profile")
        .set("Authorization", `Bearer ${providerUser.token}`)
        .send({
          displayName: "Ustad Tariq Wiring",
          photoUrl: "https://ik.imagekit.io/test/avatar.png",
          photoFileId: "avatar-file-2",
          description:
            "Experienced residential and commercial electrical installation specialist.",
          experienceYears: 8,
        }),
      request(app)
        .put("/api/v1/provider/me/services")
        .set("Authorization", `Bearer ${providerUser.token}`)
        .send({
          services: [
            {
              categoryId,
              title: "Home Wiring & Breaker Fix",
              description:
                "Complete house wiring inspection and circuit breaker repair.",
            },
          ],
        }),
      request(app)
        .put("/api/v1/provider/me/service-area")
        .set("Authorization", `Bearer ${providerUser.token}`)
        .send({ localityId, lat: 34.5106, lng: 72.4849, radiusKm: 15 }),
    ]);

    await request(app)
      .post("/api/v1/provider/me/submit")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({});

    const nonAdminDecision = await request(app)
      .post(`/api/v1/admin/providers/${providerId}/decision`)
      .set("Authorization", `Bearer ${bystander.token}`)
      .send({ decision: "APPROVED" });
    expect(nonAdminDecision.status).toBe(403);

    const shortReject = await request(app)
      .post(`/api/v1/admin/providers/${providerId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "REJECTED", reason: "short" });
    expect(shortReject.status).toBe(422);

    const rejectOk = await request(app)
      .post(`/api/v1/admin/providers/${providerId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "REJECTED",
        reason: "Please provide a clearer service description.",
      });
    expect(rejectOk.status).toBe(200);
    expect(rejectOk.body.data.profile.status).toBe("REJECTED");

    const notifications = await prisma.notification.findMany({
      where: { userId: providerUser.userId },
    });
    expect(notifications.length).toBe(1);
    expect(notifications[0]?.type).toBe("PROVIDER_REJECTED");

    await request(app)
      .post("/api/v1/provider/me/submit")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({});
    const approveOk = await request(app)
      .post(`/api/v1/admin/providers/${providerId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "APPROVED" });
    expect(approveOk.status).toBe(200);
    expect(approveOk.body.data.profile.status).toBe("APPROVED");

    // PRV-7: Public profile visible & NEVER exposes lat/lng
    const pubProfile = await request(app).get(`/api/v1/providers/${providerId}`);
    expect(pubProfile.status).toBe(200);
    expect(pubProfile.body.data.profile.serviceArea.localityName).toBeTypeOf(
      "string"
    );
    expect(pubProfile.body.data.profile.serviceArea.lat).toBeUndefined();
    expect(pubProfile.body.data.profile.serviceArea.lng).toBeUndefined();

    // PRV-5: Editing APPROVED profile keeps status APPROVED
    const edited = await request(app)
      .put("/api/v1/provider/me/profile")
      .set("Authorization", `Bearer ${providerUser.token}`)
      .send({ experienceYears: 9 });
    expect(edited.status).toBe(200);
    expect(edited.body.data.profile.status).toBe("APPROVED");

    // PRV-6: Suspending hides public profile (404)
    const suspended = await request(app)
      .post(`/api/v1/admin/providers/${providerId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "SUSPENDED", reason: "Compliance review needed." });
    expect(suspended.status).toBe(200);
    expect(
      (await request(app).get(`/api/v1/providers/${providerId}`)).status
    ).toBe(404);
  });

  it("PRV-8: rejects overlapping or reversed availability windows and allows empty", async () => {
    const p = await registerUser("avail");
    await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${p.token}`)
      .send({});

    const bad = await request(app)
      .put("/api/v1/provider/me/availability")
      .set("Authorization", `Bearer ${p.token}`)
      .send({
        windows: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
          { dayOfWeek: 1, startTime: "12:00", endTime: "16:00" },
        ],
      });
    expect(bad.status).toBe(422);

    const emptyOk = await request(app)
      .put("/api/v1/provider/me/availability")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ windows: [] });
    expect(emptyOk.status).toBe(200);
  });

  it("UPL-1, UPL-2: rejects fake extension & oversize files, enforces upload rate limit, caps portfolio at 10, and handles delete gracefully", async () => {
    const p = await registerUser("upload");
    await request(app)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${p.token}`)
      .send({});

    // Fake .exe disguised as .jpg
    const exeBytes = Buffer.from("MZ\x90\x00\x03\x00\x00\x00fake_exe_payload");
    const fakeImg = await request(app)
      .post("/api/v1/uploads/image")
      .set("Authorization", `Bearer ${p.token}`)
      .attach("file", exeBytes, { filename: "evil.jpg", contentType: "image/jpeg" });
    expect(fakeImg.status).toBe(422);
    expect(fakeImg.body.error.code).toBe("UPLOAD_INVALID");

    // Oversize (> 5 MB)
    const bigBuf = Buffer.concat([VALID_PNG, Buffer.alloc(5 * 1024 * 1024 + 64)]);
    const bigRes = await request(app)
      .post("/api/v1/uploads/image")
      .set("Authorization", `Bearer ${p.token}`)
      .attach("file", bigBuf, { filename: "big.png", contentType: "image/png" });
    expect(bigRes.status).toBe(422);

    // Valid uploads up to rate limit (2 failed + 3 valid = 5 total requests in window)
    for (let i = 0; i < 3; i++) {
      const ok = await request(app)
        .post("/api/v1/uploads/image")
        .set("Authorization", `Bearer ${p.token}`)
        .attach("file", VALID_PNG, {
          filename: `valid-${i}.png`,
          contentType: "image/png",
        });
      expect(ok.status).toBe(201);
      expect(ok.body.data.url).toContain("https://ik.imagekit.io/");
    }

    // 6th upload request hits rate limit 429
    const limited = await request(app)
      .post("/api/v1/uploads/image")
      .set("Authorization", `Bearer ${p.token}`)
      .attach("file", VALID_PNG, { filename: "v4.png", contentType: "image/png" });
    expect(limited.status).toBe(429);

    // Portfolio limit max 10
    let lastMediaId = "";
    for (let i = 0; i < 10; i++) {
      const added = await request(app)
        .post("/api/v1/provider/me/portfolio")
        .set("Authorization", `Bearer ${p.token}`)
        .send({
          imageUrl: `https://ik.imagekit.io/test/item-${i}.png`,
          fileId: `pf-${i}`,
          sortOrder: i,
        });
      expect(added.status).toBe(201);
      lastMediaId = added.body.data.profile.portfolio[i].id;
    }

    const eleventh = await request(app)
      .post("/api/v1/provider/me/portfolio")
      .set("Authorization", `Bearer ${p.token}`)
      .send({
        imageUrl: "https://ik.imagekit.io/test/item-10.png",
        fileId: "pf-10",
        sortOrder: 10,
      });
    expect(eleventh.status).toBe(422);

    // UPL-2: delete succeeds even if external ImageKit delete fails
    shouldThrowOnDelete = true;
    const del = await request(app)
      .delete(`/api/v1/provider/me/portfolio/${lastMediaId}`)
      .set("Authorization", `Bearer ${p.token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.profile.portfolio.length).toBe(9);
    expect(deletedFileIds).toContain("pf-9");
  });
});
