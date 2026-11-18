import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

async function getAdminToken(): Promise<string> {
  const email = config.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { roles: true },
  });
  if (!existing) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.default.hash(config.SEED_ADMIN_PASSWORD, 12);
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        fullName: "System Admin",
        status: "ACTIVE",
        roles: { create: [{ role: "ADMIN" }] },
      },
    });
  }
  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password: config.SEED_ADMIN_PASSWORD,
  });
  return login.body.data.accessToken as string;
}

async function getCustomerToken(): Promise<string> {
  const res = await request(app).post("/api/v1/auth/register").send({
    email: `cat-cust-${Date.now()}@example.com`,
    password: "StrongPassword123!",
    fullName: "Catalog Customer",
  });
  return res.body.data.accessToken as string;
}

describe("Phase 2 Catalog & Locations Integration", () => {
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    adminToken = await getAdminToken();
    customerToken = await getCustomerToken();
  });

  beforeEach(async () => {
    await prisma.category.deleteMany({
      where: { slug: { startsWith: "test-cat-" } },
    });
    await prisma.$executeRaw`DELETE FROM localities WHERE slug LIKE 'test-loc-%'`;
  });

  afterAll(async () => {
    await prisma.category.deleteMany({
      where: { slug: { startsWith: "test-cat-" } },
    });
    await prisma.$executeRaw`DELETE FROM localities WHERE slug LIKE 'test-loc-%'`;
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { startsWith: "cat-cust-" } } },
    });
    await prisma.customerProfile.deleteMany({
      where: { user: { email: { startsWith: "cat-cust-" } } },
    });
    await prisma.userRole.deleteMany({
      where: { user: { email: { startsWith: "cat-cust-" } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: "cat-cust-" } },
    });
    await prisma.$disconnect();
  });

  it("CAT-1: inactive category is hidden publicly and visible to admin", async () => {
    const created = await request(app)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Inactive Trade",
        slug: "test-cat-inactive",
        iconKey: "build",
        isActive: false,
        sortOrder: 99,
      });
    expect(created.status).toBe(201);

    const pub = await request(app).get("/api/v1/categories");
    expect(pub.status).toBe(200);
    expect(
      pub.body.data.categories.some(
        (c: { slug: string }) => c.slug === "test-cat-inactive"
      )
    ).toBe(false);

    const adm = await request(app)
      .get("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adm.status).toBe(200);
    expect(
      adm.body.data.categories.some(
        (c: { slug: string }) => c.slug === "test-cat-inactive"
      )
    ).toBe(true);
  });

  it("CAT-2: duplicate category and locality slugs are rejected with 409", async () => {
    const c1 = await request(app)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Trade One",
        slug: "test-cat-dup",
        iconKey: "bolt",
        isActive: true,
        sortOrder: 1,
      });
    expect(c1.status).toBe(201);

    const c2 = await request(app)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Trade Two",
        slug: "test-cat-dup",
        iconKey: "bolt",
        isActive: true,
        sortOrder: 2,
      });
    expect(c2.status).toBe(409);
    expect(c2.body.error.code).toBe("DUPLICATE_SLUG");

    const l1 = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Province",
        slug: "test-loc-dup",
        level: "PROVINCE",
        parentId: null,
        lat: 34.0,
        lng: 72.0,
        isServiceable: false,
      });
    expect(l1.status).toBe(201);

    const l2 = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Province 2",
        slug: "test-loc-dup",
        level: "PROVINCE",
        parentId: null,
        lat: 34.1,
        lng: 72.1,
        isServiceable: false,
      });
    expect(l2.status).toBe(409);
  });

  it("LOC-1: enforces PROVINCE -> DISTRICT -> LOCALITY hierarchy", async () => {
    const prov = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Prov",
        slug: "test-loc-prov",
        level: "PROVINCE",
        parentId: null,
        lat: 34.0,
        lng: 72.0,
        isServiceable: false,
      });
    expect(prov.status).toBe(201);
    const provId = prov.body.data.locality.id as string;

    // LOCALITY directly under PROVINCE must fail
    const badLoc = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Bad Locality",
        slug: "test-loc-bad",
        level: "LOCALITY",
        parentId: provId,
        lat: 34.5,
        lng: 72.5,
        isServiceable: true,
      });
    expect(badLoc.status).toBe(422);
    expect(badLoc.body.error.code).toBe("INVALID_HIERARCHY");

    // PROVINCE with a parent must fail
    const badProv = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Bad Prov",
        slug: "test-loc-bad-prov",
        level: "PROVINCE",
        parentId: provId,
        lat: 34.0,
        lng: 72.0,
        isServiceable: false,
      });
    expect(badProv.status).toBe(422);
  });

  it("LOC-2: no locality or district names are hardcoded in application source files", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "../../../../");
    const seedJsonPath = path.join(
      repoRoot,
      "server",
      "prisma",
      "seed-data",
      "localities.json"
    );
    const seedRows = JSON.parse(await fs.readFile(seedJsonPath, "utf8")) as {
      name: string;
    }[];
    const forbiddenNames = seedRows
      .map((r) => r.name)
      .filter((name) => name.length >= 4);

    const scanRoots = [
      path.join(repoRoot, "shared", "src"),
      path.join(repoRoot, "server", "src"),
      path.join(repoRoot, "admin", "src"),
      path.join(repoRoot, "mobile", "src"),
      path.join(repoRoot, "mobile", "app"),
    ];

    async function walk(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "tests" || entry.name === "generated") continue;
          files.push(...(await walk(full)));
        } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
          files.push(full);
        }
      }
      return files;
    }

    const sourceFiles = (await Promise.all(scanRoots.map(walk))).flat();
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const content = await fs.readFile(file, "utf8");
      for (const name of forbiddenNames) {
        if (new RegExp(`\\b${name}\\b`, "i").test(content)) {
          violations.push(`${path.relative(repoRoot, file)} contains "${name}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("LOC-3: real PostGIS query marks inside vs outside service area using LOCATION_MATCH_RADIUS_KM", async () => {
    const prov = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Region",
        slug: "test-loc-region",
        level: "PROVINCE",
        parentId: null,
        lat: 34.0,
        lng: 71.5,
        isServiceable: false,
      });

    const dist = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test District Hub",
        slug: "test-loc-district",
        level: "DISTRICT",
        parentId: prov.body.data.locality.id,
        lat: 34.5106,
        lng: 72.4849,
        isServiceable: true,
      });
    expect(dist.status).toBe(201);

    // Within 1 km of serviceable point -> inside service area
    const inside = await request(app)
      .get("/api/v1/localities/check")
      .query({ lat: 34.515, lng: 72.486 });
    expect(inside.status).toBe(200);
    expect(inside.body.data.outsideServiceArea).toBe(false);
    expect(inside.body.data.nearestLocality).not.toBeNull();

    // ~300+ km away -> outside service area
    const outside = await request(app)
      .get("/api/v1/localities/check")
      .query({ lat: 31.5204, lng: 74.3587 });
    expect(outside.status).toBe(200);
    expect(outside.body.data.outsideServiceArea).toBe(true);
  });

  it("enforces ADMIN-only permissions on catalog write endpoints", async () => {
    const guestRes = await request(app).post("/api/v1/admin/categories").send({
      name: "Unauth",
      slug: "test-cat-unauth",
      iconKey: "bolt",
    });
    expect(guestRes.status).toBe(401);

    const custCat = await request(app)
      .post("/api/v1/admin/categories")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        name: "Forbidden",
        slug: "test-cat-forbidden",
        iconKey: "bolt",
      });
    expect(custCat.status).toBe(403);

    const custLoc = await request(app)
      .post("/api/v1/admin/localities")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        name: "Forbidden Loc",
        slug: "test-loc-forbidden",
        level: "PROVINCE",
        parentId: null,
        lat: 34.0,
        lng: 72.0,
      });
    expect(custLoc.status).toBe(403);
  });
});
