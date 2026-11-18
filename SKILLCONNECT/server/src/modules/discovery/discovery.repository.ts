import type {
  ProviderSearchQuery,
  ProviderSearchResultDto,
} from "@skillconnect/shared";
import { Prisma, type PrismaClient } from "../../generated/prisma/index.js";
import {
  averageRating,
  formatDistanceLabel,
  isAvailableNow,
  roundDistanceKm,
  sortComparator,
} from "../../domain/discovery.js";

interface RawSearchRow {
  id: string;
  userId: string;
  displayName: string;
  photoUrl: string | null;
  experienceYears: number | null;
  isAcceptingWork: boolean;
  localityName: string;
  distanceMeters: number;
}

export interface ReviewFixtureScore {
  providerProfileId: string;
  ratings: number[];
}

export function createDiscoveryRepository(prisma: PrismaClient) {
  /**
   * DSC-1, DSC-2, DSC-3, DSC-4, DSC-5, PRV-7:
   * Searches APPROVED providers with ACTIVE users using parameterized PostGIS ST_DWithin.
   * Never stores or logs the customer search point and never selects ServiceArea center coordinates.
   */
  const searchProviders = async (
    query: ProviderSearchQuery,
    nowUtc: Date = new Date(),
    fixtureRatings?: Map<string, number[]>
  ): Promise<{ items: ProviderSearchResultDto[]; total: number }> => {
    const categoryClause = query.categoryId
      ? Prisma.sql`AND ps.category_id = ${query.categoryId}::uuid`
      : Prisma.empty;

    const qPattern = query.q ? `%${query.q}%` : null;
    const textClause = qPattern
      ? Prisma.sql`AND (
          pp.display_name ILIKE ${qPattern}
          OR c.name ILIKE ${qPattern}
          OR ps.title ILIKE ${qPattern}
        )`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<RawSearchRow[]>`
      SELECT DISTINCT ON (pp.id)
        pp.id,
        pp.user_id AS "userId",
        pp.display_name AS "displayName",
        pp.photo_url AS "photoUrl",
        pp.experience_years AS "experienceYears",
        pp.is_accepting_work AS "isAcceptingWork",
        l.name AS "localityName",
        ST_Distance(
          sa.center,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
        ) AS "distanceMeters"
      FROM provider_profiles pp
      JOIN users u ON u.id = pp.user_id
      JOIN service_areas sa ON sa.provider_profile_id = pp.id
      JOIN localities l ON l.id = sa.locality_id
      JOIN provider_services ps ON ps.provider_profile_id = pp.id
      JOIN categories c ON c.id = ps.category_id
      WHERE pp.status = 'APPROVED'
        AND u.status = 'ACTIVE'
        AND c.is_active = true
        AND ST_DWithin(
          sa.center,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography,
          sa.radius_km * 1000.0
        )
        ${categoryClause}
        ${textClause}
      ORDER BY pp.id
    `;

    if (rows.length === 0) {
      return { items: [], total: 0 };
    }

    const providerIds = rows.map((r) => r.id);

    const [services, windows, reviewRows] = await Promise.all([
      prisma.providerService.findMany({
        where: {
          providerProfileId: { in: providerIds },
          category: { isActive: true },
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.availabilityWindow.findMany({
        where: { providerProfileId: { in: providerIds } },
      }),
      fixtureRatings
        ? Promise.resolve([])
        : prisma.review.findMany({
            where: { providerProfileId: { in: providerIds } },
            select: { providerProfileId: true, rating: true },
          }),
    ]);

    const ratingsByProvider = new Map<string, number[]>();
    if (fixtureRatings) {
      for (const [k, v] of fixtureRatings.entries()) {
        ratingsByProvider.set(k, v);
      }
    } else {
      for (const r of reviewRows) {
        const list = ratingsByProvider.get(r.providerProfileId) ?? [];
        list.push(r.rating);
        ratingsByProvider.set(r.providerProfileId, list);
      }
    }

    const servicesByProvider = new Map<string, typeof services>();
    for (const s of services) {
      const list = servicesByProvider.get(s.providerProfileId) ?? [];
      list.push(s);
      servicesByProvider.set(s.providerProfileId, list);
    }

    const windowsByProvider = new Map<string, typeof windows>();
    for (const w of windows) {
      const list = windowsByProvider.get(w.providerProfileId) ?? [];
      list.push(w);
      windowsByProvider.set(w.providerProfileId, list);
    }

    const enriched = rows
      .map((row) => {
        const provServices = servicesByProvider.get(row.id) ?? [];
        const provWindows = windowsByProvider.get(row.id) ?? [];
        const availableNow = isAvailableNow(
          provWindows,
          row.isAcceptingWork,
          nowUtc
        );

        const ratings = ratingsByProvider.get(row.id) ?? [];
        const avg = averageRating(ratings);

        const categories = Array.from(
          new Map(
            provServices.map((s) => [s.category.id, s.category])
          ).values()
        );

        const qLower = query.q?.toLowerCase();
        const matchingService =
          (qLower
            ? provServices.find(
                (s) =>
                  s.title.toLowerCase().includes(qLower) ||
                  s.category.name.toLowerCase().includes(qLower)
              )
            : query.categoryId
              ? provServices.find((s) => s.categoryId === query.categoryId)
              : provServices[0]) ?? provServices[0];

        return {
          id: row.id,
          userId: row.userId,
          displayName: row.displayName,
          photoUrl: row.photoUrl,
          experienceYears: row.experienceYears,
          isAcceptingWork: row.isAcceptingWork,
          isAvailableNow: availableNow,
          localityName: row.localityName,
          distanceMeters: row.distanceMeters,
          distanceKm: roundDistanceKm(row.distanceMeters),
          distanceLabel: formatDistanceLabel(row.distanceMeters),
          averageRating: avg,
          reviewCount: ratings.length,
          categories,
          matchingServiceTitle: matchingService?.title ?? null,
        };
      })
      .filter((item) => !query.availableNow || item.isAvailableNow);

    enriched.sort(sortComparator(query.sort));

    const total = enriched.length;
    const paged = enriched
      .slice(query.offset, query.offset + query.limit)
      .map(({ distanceMeters: _ignored, ...dto }) => dto);

    return { items: paged, total };
  };

  return { searchProviders };
}
