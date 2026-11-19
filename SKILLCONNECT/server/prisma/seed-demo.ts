import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { loadConfig } from "../src/config/env.js";
import { logger } from "../src/lib/logger.js";
import { createPrismaClient } from "../src/lib/prisma.js";

const BCRYPT_COST = 12;
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? "DemoPass123!";

interface DemoProviderSpec {
  email: string;
  fullName: string;
  displayName: string;
  experienceYears: number;
  description: string;
  categorySlug: string;
  radiusKm: number;
  localityIndex: number;
  services: Array<{ title: string; description: string }>;
  review?: {
    serviceName: string;
    pricePkr: number;
    rating: number;
    comment: string;
  };
}

const DEMO_PROVIDERS: DemoProviderSpec[] = [
  {
    email: "electrician@skillconnect.demo",
    fullName: "Tariq Khan",
    displayName: "Ustad Tariq Electric",
    experienceYears: 9,
    description:
      "Certified residential electrician specializing in UPS/inverter wiring, distribution boards, short-circuit diagnostics, and full house rewiring.",
    categorySlug: "electrician",
    radiusKm: 25,
    localityIndex: 0,
    services: [
      {
        title: "UPS & Inverter Installation",
        description: "Complete single/double battery UPS wiring with changeover and surge protection.",
      },
      {
        title: "Short Circuit & Breaker Repair",
        description: "Fast fault tracing, DB box breaker replacement, and earthing checks.",
      },
    ],
    review: {
      serviceName: "UPS & Inverter Installation",
      pricePkr: 3500,
      rating: 5,
      comment: "Arrived on time, neat wiring, and explained the breaker setup clearly.",
    },
  },
  {
    email: "plumber@skillconnect.demo",
    fullName: "Sajid Ali",
    displayName: "Sajid Plumbing Works",
    experienceYears: 7,
    description:
      "Experienced plumber for water motor installation, underground pipe leaks, geyser fittings, and bathroom sanitary repairs.",
    categorySlug: "plumber",
    radiusKm: 25,
    localityIndex: 1,
    services: [
      {
        title: "Water Motor & Tank Fitting",
        description: "Donkey pump / pressure motor repair, automatic float switch, and tank piping.",
      },
      {
        title: "Pipe Leak & Sanitary Repair",
        description: "PPRC pipe welding, mixer tap replacement, and kitchen/bath drain clearing.",
      },
    ],
    review: {
      serviceName: "Water Motor & Tank Fitting",
      pricePkr: 2500,
      rating: 5,
      comment: "Fixed our water pressure issue in under an hour. Very clean work.",
    },
  },
  {
    email: "ac@skillconnect.demo",
    fullName: "Kamran Shah",
    displayName: "Kamran Cooling & AC",
    experienceYears: 6,
    description:
      "Split and inverter AC technician offering master jet service, R32/R410A gas charging, and outdoor unit troubleshooting.",
    categorySlug: "ac-technician",
    radiusKm: 25,
    localityIndex: 2,
    services: [
      {
        title: "Split AC Master Service",
        description: "Indoor/outdoor coil pressure wash, drain flush, and cooling performance check.",
      },
      {
        title: "AC Gas Refill & Leak Test",
        description: "Nitrogen leak detection, flare-nut sealing, and accurate refrigerant top-up.",
      },
    ],
    review: {
      serviceName: "Split AC Master Service",
      pricePkr: 3000,
      rating: 4,
      comment: "Good cooling after service and reasonable cash price.",
    },
  },
  {
    email: "solar@skillconnect.demo",
    fullName: "Waqas Ahmad",
    displayName: "Waqas Solar Solutions",
    experienceYears: 5,
    description:
      "Hybrid and off-grid solar technician for 3kW–10kW home systems, MPPT inverter tuning, and panel tilt/cleaning.",
    categorySlug: "solar-technician",
    radiusKm: 30,
    localityIndex: 0,
    services: [
      {
        title: "Hybrid Solar Inverter Setup",
        description: "Inverter configuration, DC breaker protection, and lithium/tubular battery setup.",
      },
      {
        title: "Solar System Troubleshooting",
        description: "String voltage testing, earthing check, and panel output diagnostics.",
      },
    ],
    review: {
      serviceName: "Solar System Troubleshooting",
      pricePkr: 4000,
      rating: 5,
      comment: "Solved our inverter overload error and balanced the strings properly.",
    },
  },
  {
    email: "carpenter@skillconnect.demo",
    fullName: "Nadeem Gul",
    displayName: "Nadeem Woodcraft",
    experienceYears: 11,
    description:
      "Skilled carpenter for door locks, hinges, kitchen cabinets, wardrobe repairs, and custom wooden shelving.",
    categorySlug: "carpenter",
    radiusKm: 20,
    localityIndex: 1,
    services: [
      {
        title: "Door, Lock & Hinge Repair",
        description: "Main door alignment, mortise lock replacement, and hydraulic closer installation.",
      },
      {
        title: "Kitchen Cabinet & Wardrobe Fix",
        description: "Soft-close hinges, drawer channels, and laminate edge repair.",
      },
    ],
    review: {
      serviceName: "Door, Lock & Hinge Repair",
      pricePkr: 2000,
      rating: 5,
      comment: "Solid craftsmanship and brought all needed hardware.",
    },
  },
  {
    email: "mechanic@skillconnect.demo",
    fullName: "Farhan Ullah",
    displayName: "Farhan Auto & Generator",
    experienceYears: 8,
    description:
      "On-site mechanic for home petrol/gas generators, battery jump-starts, and routine car/bike troubleshooting.",
    categorySlug: "mechanic",
    radiusKm: 25,
    localityIndex: 2,
    services: [
      {
        title: "Home Generator Tuning & Oil Change",
        description: "Carburetor cleaning, spark plug replacement, and load voltage tuning.",
      },
      {
        title: "On-Site Vehicle Breakdown Check",
        description: "Battery, starter, alternator, and basic roadside mechanical diagnostics.",
      },
    ],
  },
];

async function main() {
  const config = loadConfig();
  const prisma = createPrismaClient(config.DATABASE_URL);

  try {
    const admin = await prisma.user.findUnique({
      where: { email: config.SEED_ADMIN_EMAIL.trim().toLowerCase() },
    });
    if (!admin) {
      throw new Error("Admin user not found. Run `npm run prisma:seed` first.");
    }

    const categories = await prisma.category.findMany({ where: { isActive: true } });
    const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    const localities = await prisma.$queryRaw<
      Array<{ id: string; slug: string; lat: number; lng: number }>
    >`
      SELECT id, slug, ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng
      FROM localities
      WHERE is_serviceable = true AND level = 'LOCALITY'
      ORDER BY slug ASC
      LIMIT 10
    `;
    if (localities.length === 0) {
      throw new Error("No serviceable localities found. Run `npm run prisma:seed` first.");
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

    // 1. Seed Demo Customer
    const customerEmail = "customer@skillconnect.demo";
    let customer = await prisma.user.findUnique({ where: { email: customerEmail } });
    if (!customer) {
      customer = await prisma.user.create({
        data: {
          email: customerEmail,
          passwordHash,
          fullName: "Bilal Ahmad",
          status: "ACTIVE",
          roles: { create: [{ role: "CUSTOMER" }] },
          customerProfile: {
            create: { defaultLocalityId: localities[0]!.id },
          },
        },
      });
    }

    // 2. Seed 6 Approved Demo Providers + Service Areas + Availability + Sample Reviews
    for (const spec of DEMO_PROVIDERS) {
      const categoryId = catBySlug.get(spec.categorySlug);
      if (!categoryId) continue;

      const loc = localities[spec.localityIndex % localities.length]!;

      let user = await prisma.user.findUnique({ where: { email: spec.email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: spec.email,
            passwordHash,
            fullName: spec.fullName,
            status: "ACTIVE",
            roles: { create: [{ role: "CUSTOMER" }, { role: "PROVIDER" }] },
            customerProfile: { create: { defaultLocalityId: loc.id } },
          },
        });
      }

      let profile = await prisma.providerProfile.findUnique({ where: { userId: user.id } });
      if (!profile) {
        profile = await prisma.providerProfile.create({
          data: {
            userId: user.id,
            displayName: spec.displayName,
            description: spec.description,
            experienceYears: spec.experienceYears,
            status: "APPROVED",
            isAcceptingWork: true,
            submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        });

        await prisma.providerVerification.create({
          data: {
            providerProfileId: profile.id,
            reviewedByUserId: admin.id,
            decision: "APPROVED",
            reason: "Demo profile verified",
          },
        });
      }

      for (const svc of spec.services) {
        await prisma.providerService.upsert({
          where: {
            providerProfileId_categoryId_title: {
              providerProfileId: profile.id,
              categoryId,
              title: svc.title,
            },
          },
          update: { description: svc.description },
          create: {
            providerProfileId: profile.id,
            categoryId,
            title: svc.title,
            description: svc.description,
          },
        });
      }

      // Upsert PostGIS service_area
      const existingArea = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM service_areas WHERE provider_profile_id = ${profile.id}::uuid LIMIT 1
      `;
      const areaId = existingArea[0]?.id ?? crypto.randomUUID();
      await prisma.$executeRaw`
        INSERT INTO service_areas (id, provider_profile_id, locality_id, center, radius_km, created_at, updated_at)
        VALUES (
          ${areaId}::uuid,
          ${profile.id}::uuid,
          ${loc.id}::uuid,
          ST_SetSRID(ST_MakePoint(${loc.lng}, ${loc.lat}), 4326)::geography,
          ${spec.radiusKm},
          NOW(),
          NOW()
        )
        ON CONFLICT (provider_profile_id) DO UPDATE SET
          locality_id = EXCLUDED.locality_id,
          center = EXCLUDED.center,
          radius_km = EXCLUDED.radius_km,
          updated_at = NOW()
      `;

      // Seed Mon-Sun 08:00-22:00 availability windows if none exist
      const windowCount = await prisma.availabilityWindow.count({
        where: { providerProfileId: profile.id },
      });
      if (windowCount === 0) {
        await prisma.availabilityWindow.createMany({
          data: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
            providerProfileId: profile.id,
            dayOfWeek,
            startTime: "08:00",
            endTime: "22:00",
          })),
        });
      }

      // Seed a completed booking + review so ratings show in search & profile
      if (spec.review) {
        let conv = await prisma.conversation.findUnique({
          where: {
            customerUserId_providerProfileId: {
              customerUserId: customer.id,
              providerProfileId: profile.id,
            },
          },
        });
        if (!conv) {
          conv = await prisma.conversation.create({
            data: {
              customerUserId: customer.id,
              providerProfileId: profile.id,
              participants: {
                create: [
                  { userId: customer.id, roleInConversation: "CUSTOMER" },
                  { userId: user.id, roleInConversation: "PROVIDER" },
                ],
              },
            },
          });

          await prisma.message.create({
            data: {
              conversationId: conv.id,
              senderId: customer.id,
              type: "TEXT",
              body: `Salam ${spec.fullName}, are you available for ${spec.review.serviceName}?`,
              clientMessageId: `demo-init-${profile.id}`,
            },
          });
        }

        const existingReview = await prisma.review.findFirst({
          where: { providerProfileId: profile.id, customerUserId: customer.id },
        });
        if (!existingReview) {
          const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
          const offer = await prisma.serviceOffer.create({
            data: {
              conversationId: conv.id,
              providerProfileId: profile.id,
              customerUserId: customer.id,
              serviceName: spec.review.serviceName,
              description: spec.services[0]!.description,
              price: spec.review.pricePkr,
              proposedStart: pastDate,
              status: "ACCEPTED",
              expiresAt: pastDate,
              respondedAt: pastDate,
            },
          });

          const booking = await prisma.booking.create({
            data: {
              offerId: offer.id,
              conversationId: conv.id,
              customerUserId: customer.id,
              providerProfileId: profile.id,
              serviceName: spec.review.serviceName,
              description: spec.services[0]!.description,
              price: spec.review.pricePkr,
              scheduledStart: pastDate,
              serviceAddress: "Main Bazaar Road, Near College Gate",
              status: "COMPLETED",
              providerCompletedAt: pastDate,
              completedAt: pastDate,
              history: {
                create: [
                  {
                    fromStatus: null,
                    toStatus: "CONFIRMED",
                    actorType: "USER",
                    actorUserId: customer.id,
                  },
                  {
                    fromStatus: "CONFIRMED",
                    toStatus: "COMPLETED",
                    actorType: "USER",
                    actorUserId: customer.id,
                  },
                ],
              },
            },
          });

          await prisma.review.create({
            data: {
              bookingId: booking.id,
              customerUserId: customer.id,
              providerProfileId: profile.id,
              rating: spec.review.rating,
              comment: spec.review.comment,
            },
          });
        }
      }
    }

    logger.info({ providersSeeded: DEMO_PROVIDERS.length }, "Demo seed completed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : "Demo seed failed" });
  process.exit(1);
});
