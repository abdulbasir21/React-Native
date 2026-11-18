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

const baseConfig = loadConfig({
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: testDbUrl,
});

const prisma: PrismaClient = createPrismaClient(testDbUrl);

async function cleanupRelease2Data() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "r2-test-" } },
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
    await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: { in: convIds } },
    });
    await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
  }

  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.serviceArea.deleteMany({
    where: { providerProfile: { userId: { in: ids } } },
  });
  await prisma.providerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe("Release 2 (R2-1 to R2-5) Integration", () => {
  let customerToken: string;
  let providerToken: string;
  let outsiderToken: string;
  let providerProfileId: string;
  let conversationId: string;
  let activeCategorySlug: string;

  beforeAll(async () => {
    await cleanupRelease2Data();
    const suffix = Date.now();

    const setupApp = createApp({
      config: baseConfig,
      prisma,
      checkDatabase: async () => true,
    });

    const custReg = await request(setupApp).post("/api/v1/auth/register").send({
      email: `r2-test-c-${suffix}@example.com`,
      password: "Password123!",
      fullName: "R2 Customer",
    });
    customerToken = custReg.body.data.accessToken;

    const provReg = await request(setupApp).post("/api/v1/auth/register").send({
      email: `r2-test-p-${suffix}@example.com`,
      password: "Password123!",
      fullName: "R2 Provider",
    });
    providerToken = provReg.body.data.accessToken;

    const outReg = await request(setupApp).post("/api/v1/auth/register").send({
      email: `r2-test-o-${suffix}@example.com`,
      password: "Password123!",
      fullName: "R2 Outsider",
    });
    outsiderToken = outReg.body.data.accessToken;

    await request(setupApp)
      .post("/api/v1/provider/me/onboarding")
      .set("Authorization", `Bearer ${providerToken}`);

    const profile = await prisma.providerProfile.findUniqueOrThrow({
      where: { userId: provReg.body.data.user.id },
    });
    providerProfileId = profile.id;
    await prisma.providerProfile.update({
      where: { id: providerProfileId },
      data: { displayName: "R2 Tech", status: "APPROVED" },
    });

    const loc = await prisma.locality.findFirstOrThrow();
    await prisma.$executeRaw`
      INSERT INTO service_areas (id, provider_profile_id, locality_id, center, radius_km, created_at, updated_at)
      VALUES (gen_random_uuid(), ${providerProfileId}::uuid, ${loc.id}::uuid, ST_SetSRID(ST_MakePoint(72.48, 34.49), 4326)::geography, 10, NOW(), NOW())
    `;

    const cat = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    activeCategorySlug = cat.slug;

    const conv = await request(setupApp)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ providerProfileId });
    conversationId = conv.body.data.conversation.id;
  });

  afterAll(async () => {
    await cleanupRelease2Data();
    await prisma.$disconnect();
  });

  it("R2-1: handles valid cached AI, rejects invalid JSON with fallback, falls back on quota error, and enforces call limit", async () => {
    let calls = 0;
    let mode: "valid" | "invalid" | "error" = "valid";

    const app = createApp({
      config: { ...baseConfig, GEMINI_API_KEY: "test-secret-never-leaked" },
      prisma,
      checkDatabase: async () => true,
      aiMaxCallsPerHour: 3,
      aiGenerator: async () => {
        calls += 1;
        if (mode === "error") throw new Error("429 RESOURCE_EXHAUSTED");
        if (mode === "invalid") return "{not-valid-json";
        return JSON.stringify({
          suggestedCategorySlug: activeCategorySlug,
          suggestedCategoryName: "Test Cat",
          searchKeywords: ["breaker", "spark"],
          missingDetailsPrompts: ["Which room?"],
          uncertaintyNote: "Preliminary suggestion only.",
        });
      },
    });

    const ok1 = await request(app)
      .post("/api/v1/ai/understand")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ problemText: "Main breaker keeps tripping in kitchen" });
    expect(ok1.status).toBe(200);
    expect(ok1.body.data.fallbackUsed).toBe(false);
    expect(ok1.body.data.suggestedCategorySlug).toBe(activeCategorySlug);
    expect(JSON.stringify(ok1.body)).not.toContain("test-secret-never-leaked");

    // Identical query hits cache (calls stays 1)
    const okCached = await request(app)
      .post("/api/v1/ai/understand")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ problemText: "Main breaker keeps tripping in kitchen" });
    expect(okCached.status).toBe(200);
    expect(calls).toBe(1);

    // Invalid JSON falls back cleanly
    mode = "invalid";
    const invRes = await request(app)
      .post("/api/v1/ai/understand")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ problemText: "Water pipe leaking under sink" });
    expect(invRes.status).toBe(200);
    expect(invRes.body.data.fallbackUsed).toBe(true);

    // Quota error falls back cleanly
    mode = "error";
    const errRes = await request(app)
      .post("/api/v1/ai/understand")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ problemText: "AC fan is noisy today" });
    expect(errRes.status).toBe(200);
    expect(errRes.body.data.fallbackUsed).toBe(true);

    // 4th unique call exceeds limit (3/hr) -> 429
    const rateRes = await request(app)
      .post("/api/v1/ai/understand")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ problemText: "Door lock jammed badly" });
    expect(rateRes.status).toBe(429);
  });

  it("R2-2 & R2-3: structures offer without inventing missing fields, enforces PROVIDER role, and enforces participant scope on chat assist", async () => {
    const app = createApp({
      config: baseConfig,
      prisma,
      checkDatabase: async () => true,
      aiGenerator: async (prompt) => {
        if (prompt.includes("Extract structured service offer")) {
          return JSON.stringify({
            serviceName: "Fan Repair",
            description: "Replace capacitor and balance blades",
            pricePkr: null,
            proposedStartIso: null,
            terms: null,
          });
        }
        return JSON.stringify({
          resultText: "Customer needs a fan capacitor replacement.",
          bulletPoints: ["Ask ceiling height"],
        });
      },
    });

    // Customer cannot use provider offer structuring
    const custTry = await request(app)
      .post("/api/v1/ai/structure-offer")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ rawText: "I will fix the ceiling fan tomorrow" });
    expect(custTry.status).toBe(403);

    // Provider gets structured fields with missing price/date left null
    const provTry = await request(app)
      .post("/api/v1/ai/structure-offer")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ rawText: "I can do fan repair and replace capacitor" });
    expect(provTry.status).toBe(200);
    expect(provTry.body.data.serviceName).toBe("Fan Repair");
    expect(provTry.body.data.pricePkr).toBeNull();
    expect(provTry.body.data.proposedStartIso).toBeNull();

    // Non-participant gets 404 on chat assist
    const outAssist = await request(app)
      .post(`/api/v1/ai/conversations/${conversationId}/assist`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ action: "summarize" });
    expect(outAssist.status).toBe(404);

    // Participant gets chat assist
    const okAssist = await request(app)
      .post(`/api/v1/ai/conversations/${conversationId}/assist`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ action: "summarize" });
    expect(okAssist.status).toBe(200);
    expect(okAssist.body.data.action).toBe("summarize");
  });

  it("R2-4 & R2-5: falls back gracefully without key/on error, and parses Places New & Routes API responses with caching", async () => {
    // 1. Without GOOGLE_MAPS_SERVER_KEY -> graceful fallback
    const noKeyApp = createApp({
      config: { ...baseConfig, GOOGLE_MAPS_SERVER_KEY: undefined },
      prisma,
      checkDatabase: async () => true,
    });

    const acFallback = await request(noKeyApp)
      .get("/api/v1/places/autocomplete")
      .query({ q: "Daggar" });
    expect(acFallback.status).toBe(200);
    expect(acFallback.body.data.fallbackToManual).toBe(true);

    const routeFallback = await request(noKeyApp)
      .get("/api/v1/routes/estimate")
      .query({ providerProfileId, originLat: 34.5, originLng: 72.5 });
    expect(routeFallback.status).toBe(200);
    expect(routeFallback.body.data.estimate).toBeNull();

    // 2. With key + mocked Places New & Routes API
    let routeCalls = 0;
    const withKeyApp = createApp({
      config: { ...baseConfig, GOOGLE_MAPS_SERVER_KEY: "maps-server-secret" },
      prisma,
      checkDatabase: async () => true,
      mapsFetch: async (url) => {
        if (url.includes("places:autocomplete")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              suggestions: [
                {
                  placePrediction: {
                    placeId: "place-123",
                    structuredFormat: {
                      mainText: { text: "Daggar Bazaar" },
                      secondaryText: { text: "Buner, KP" },
                    },
                  },
                },
              ],
            }),
          };
        }
        if (url.includes("places/place-123")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: "place-123",
              displayName: { text: "Daggar Bazaar" },
              formattedAddress: "Daggar, Buner, KP",
              location: { latitude: 34.51, longitude: 72.48 },
            }),
          };
        }
        routeCalls += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            routes: [{ distanceMeters: 4200, duration: "600s" }],
          }),
        };
      },
    });

    const acOk = await request(withKeyApp)
      .get("/api/v1/places/autocomplete")
      .query({ q: "Daggar" });
    expect(acOk.status).toBe(200);
    expect(acOk.body.data.fallbackToManual).toBe(false);
    expect(acOk.body.data.suggestions[0].placeId).toBe("place-123");

    const detOk = await request(withKeyApp)
      .get("/api/v1/places/details")
      .query({ placeId: "place-123" });
    expect(detOk.status).toBe(200);
    expect(detOk.body.data.place.lat).toBe(34.51);

    const route1 = await request(withKeyApp)
      .get("/api/v1/routes/estimate")
      .query({ providerProfileId, originLat: 34.5, originLng: 72.5 });
    expect(route1.status).toBe(200);
    expect(route1.body.data.estimate.distanceLabel).toBe("4 km");
    expect(route1.body.data.estimate.durationLabel).toBe("10 min");

    // Second call uses cache
    const route2 = await request(withKeyApp)
      .get("/api/v1/routes/estimate")
      .query({ providerProfileId, originLat: 34.5, originLng: 72.5 });
    expect(route2.status).toBe(200);
    expect(routeCalls).toBe(1);
  });
});
