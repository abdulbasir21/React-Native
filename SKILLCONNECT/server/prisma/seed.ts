import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import { loadConfig } from "../src/config/env.js";
import { logger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";

const BCRYPT_COST = 12;

interface SeedLocality {
  name: string;
  slug: string;
  level: "PROVINCE" | "DISTRICT" | "LOCALITY";
  parentSlug: string | null;
  lat: number;
  lng: number;
  isServiceable: boolean;
}

const DEFAULT_CATEGORIES = [
  { name: "Electrician", slug: "electrician", iconKey: "bolt", sortOrder: 1 },
  { name: "Plumber", slug: "plumber", iconKey: "plumbing", sortOrder: 2 },
  { name: "AC Technician", slug: "ac-technician", iconKey: "ac_unit", sortOrder: 3 },
  { name: "Solar Technician", slug: "solar-technician", iconKey: "solar_power", sortOrder: 4 },
  { name: "Mechanic", slug: "mechanic", iconKey: "build", sortOrder: 5 },
  { name: "Carpenter", slug: "carpenter", iconKey: "carpenter", sortOrder: 6 },
  { name: "Painter", slug: "painter", iconKey: "format_paint", sortOrder: 7 },
  { name: "Mobile Repair", slug: "mobile-repair", iconKey: "smartphone", sortOrder: 8 },
];

async function main() {
  const config = loadConfig();
  const prisma = createPrismaClient(config.DATABASE_URL);

  try {
    const adminEmail = config.SEED_ADMIN_EMAIL.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(config.SEED_ADMIN_PASSWORD, BCRYPT_COST);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: adminEmail },
        include: { roles: true },
      });

      if (!existing) {
        await tx.user.create({
          data: {
            email: adminEmail,
            passwordHash,
            fullName: "System Admin",
            status: "ACTIVE",
            roles: { create: [{ role: "ADMIN" }] },
          },
        });
        logger.info("Seeded admin user");
      } else if (!existing.roles.some((r) => r.role === "ADMIN")) {
        await tx.userRole.create({
          data: { userId: existing.id, role: "ADMIN" },
        });
      }

      for (const cat of DEFAULT_CATEGORIES) {
        await tx.category.upsert({
          where: { slug: cat.slug },
          update: { name: cat.name, iconKey: cat.iconKey, sortOrder: cat.sortOrder },
          create: {
            name: cat.name,
            slug: cat.slug,
            iconKey: cat.iconKey,
            isActive: true,
            sortOrder: cat.sortOrder,
          },
        });
      }
      logger.info({ count: DEFAULT_CATEGORIES.length }, "Seeded categories");
    });

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const localitiesPath = path.join(__dirname, "seed-data", "localities.json");
    const raw = await fs.readFile(localitiesPath, "utf8");
    const localities = JSON.parse(raw) as SeedLocality[];

    const slugToId = new Map<string, string>();
    for (const loc of localities) {
      const parentId = loc.parentSlug ? (slugToId.get(loc.parentSlug) ?? null) : null;
      const existingRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM localities WHERE slug = ${loc.slug} LIMIT 1
      `;
      const id = existingRows[0]?.id ?? crypto.randomUUID();

      await prisma.$executeRaw`
        INSERT INTO localities (id, parent_id, level, name, slug, center, is_serviceable, created_at, updated_at)
        VALUES (
          ${id}::uuid,
          ${parentId}::uuid,
          ${loc.level}::"LocalityLevel",
          ${loc.name},
          ${loc.slug},
          ST_SetSRID(ST_MakePoint(${loc.lng}, ${loc.lat}), 4326)::geography,
          ${loc.isServiceable},
          NOW(),
          NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          parent_id = EXCLUDED.parent_id,
          level = EXCLUDED.level,
          name = EXCLUDED.name,
          center = EXCLUDED.center,
          is_serviceable = EXCLUDED.is_serviceable,
          updated_at = NOW()
      `;
      slugToId.set(loc.slug, id);
    }
    logger.info({ count: localities.length }, "Seeded localities");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : "Seed failed" });
  process.exit(1);
});
