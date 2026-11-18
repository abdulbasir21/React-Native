import crypto from "node:crypto";
import type {
  OwnProviderProfileDto,
  OwnServiceAreaDto,
  ProviderStatus,
  PublicProviderProfileDto,
  VerificationDecision,
} from "@skillconnect/shared";
import type { Prisma, PrismaClient } from "../../generated/prisma/index.js";
import { averageRating } from "../../domain/discovery.js";
import { createNotification } from "../notifications/notifications.service.js";

interface RawServiceAreaRow {
  localityId: string;
  localityName: string;
  radiusKm: number;
  lat: number;
  lng: number;
}

export function createProvidersRepository(prisma: PrismaClient) {
  const findServiceAreaOwn = async (
    providerProfileId: string,
    tx: Prisma.TransactionClient | PrismaClient = prisma
  ): Promise<OwnServiceAreaDto | null> => {
    const rows = await tx.$queryRaw<RawServiceAreaRow[]>`
      SELECT
        sa.locality_id AS "localityId",
        l.name AS "localityName",
        sa.radius_km AS "radiusKm",
        ST_Y(sa.center::geometry) AS lat,
        ST_X(sa.center::geometry) AS lng
      FROM service_areas sa
      JOIN localities l ON l.id = sa.locality_id
      WHERE sa.provider_profile_id = ${providerProfileId}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  };

  const loadFullProfileByWhere = async (
    where: Prisma.ProviderProfileWhereUniqueInput,
    includePrivate: boolean
  ): Promise<{
    own: OwnProviderProfileDto | null;
    publicDto: PublicProviderProfileDto | null;
    userStatus: "ACTIVE" | "SUSPENDED";
    photoFileId: string | null;
  } | null> => {
    const row = await prisma.providerProfile.findUnique({
      where,
      include: {
        user: { select: { status: true } },
        services: {
          include: {
            category: { select: { id: true, name: true, slug: true, isActive: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        availability: {
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
        portfolio: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        verifications: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!row) return null;

    const [area, reviewRows] = await Promise.all([
      findServiceAreaOwn(row.id),
      prisma.review.findMany({
        where: { providerProfileId: row.id },
        select: { rating: true },
      }),
    ]);
    const ratings = reviewRows.map((r) => r.rating);

    const services = (
      includePrivate
        ? row.services
        : row.services.filter((s) => s.category.isActive)
    ).map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      categoryName: s.category.name,
      categorySlug: s.category.slug,
      title: s.title,
      description: s.description,
    }));

    const availability = row.availability.map((a) => ({
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
    }));

    const portfolio = row.portfolio.map((p) => ({
      id: p.id,
      imageUrl: p.imageUrl,
      fileId: p.fileId,
      caption: p.caption,
      sortOrder: p.sortOrder,
    }));

    // PRV-7: Public DTO omits ServiceArea center coordinates (lat/lng)
    const publicDto: PublicProviderProfileDto = {
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      photoUrl: row.photoUrl,
      description: row.description,
      experienceYears: row.experienceYears,
      status: row.status,
      isAcceptingWork: row.isAcceptingWork,
      services,
      serviceArea: area
        ? {
            localityId: area.localityId,
            localityName: area.localityName,
            radiusKm: area.radiusKm,
          }
        : null,
      availability,
      portfolio,
      averageRating: averageRating(ratings),
      reviewCount: ratings.length,
    };

    const own: OwnProviderProfileDto | null = includePrivate
      ? {
          ...publicDto,
          submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
          serviceArea: area,
          verifications: row.verifications.map((v) => ({
            id: v.id,
            decision: v.decision,
            reason: v.reason,
            createdAt: v.createdAt.toISOString(),
          })),
        }
      : null;

    return {
      own,
      publicDto,
      userStatus: row.user.status,
      photoFileId: row.photoFileId,
    };
  };

  const upsertServiceArea = async (
    providerProfileId: string,
    input: { localityId: string; lat: number; lng: number; radiusKm: number }
  ): Promise<OwnServiceAreaDto> => {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO service_areas (id, provider_profile_id, locality_id, center, radius_km, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${providerProfileId}::uuid,
        ${input.localityId}::uuid,
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
        ${input.radiusKm},
        NOW(),
        NOW()
      )
      ON CONFLICT (provider_profile_id) DO UPDATE SET
        locality_id = EXCLUDED.locality_id,
        center = EXCLUDED.center,
        radius_km = EXCLUDED.radius_km,
        updated_at = NOW()
    `;
    const area = await findServiceAreaOwn(providerProfileId);
    if (!area) throw new Error("Failed to save service area");
    return area;
  };

  const listAdminProviders = async (params: {
    status?: ProviderStatus;
    limit: number;
    offset: number;
  }) => {
    const where = params.status ? { status: params.status } : undefined;
    const [items, total] = await Promise.all([
      prisma.providerProfile.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: [{ submittedAt: "asc" }, { createdAt: "desc" }],
        include: {
          user: { select: { email: true, fullName: true, status: true } },
          services: { include: { category: { select: { name: true } } } },
        },
      }),
      prisma.providerProfile.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: p.id,
        userId: p.userId,
        displayName: p.displayName,
        status: p.status,
        submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
        userEmail: p.user.email,
        userFullName: p.user.fullName,
        userStatus: p.user.status,
        serviceCount: p.services.length,
        categories: Array.from(new Set(p.services.map((s) => s.category.name))),
      })),
      total,
    };
  };

  const applyAdminDecisionTx = async (params: {
    providerProfileId: string;
    userId: string;
    nextStatus: ProviderStatus;
    decision: VerificationDecision;
    reason: string | null;
    adminUserId: string;
  }) => {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.providerProfile.update({
        where: { id: params.providerProfileId },
        data: { status: params.nextStatus },
      });
      await tx.providerVerification.create({
        data: {
          providerProfileId: params.providerProfileId,
          decision: params.decision,
          reason: params.reason,
          reviewedByUserId: params.adminUserId,
        },
      });
      const titleMap: Record<VerificationDecision, string> = {
        APPROVED: "Provider profile approved",
        REJECTED: "Provider profile needs updates",
        SUSPENDED: "Provider profile suspended",
        REINSTATED: "Provider profile reinstated",
      };
      const bodyMap: Record<VerificationDecision, string> = {
        APPROVED: "Your provider profile is now live in search results.",
        REJECTED: params.reason ?? "Your provider application was rejected.",
        SUSPENDED: params.reason ?? "Your provider profile has been suspended.",
        REINSTATED: "Your provider profile has been reinstated.",
      };
      await createNotification(tx, {
        userId: params.userId,
        type: `PROVIDER_${params.decision}`,
        title: titleMap[params.decision],
        body: bodyMap[params.decision],
        data: { providerProfileId: params.providerProfileId, decision: params.decision },
      });
      return updated;
    });
  };

  return {
    findServiceAreaOwn,
    loadFullProfileByWhere,
    upsertServiceArea,
    listAdminProviders,
    applyAdminDecisionTx,
  };
}
