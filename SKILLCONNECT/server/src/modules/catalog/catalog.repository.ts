import crypto from "node:crypto";
import type {
  CategoryCreateInput,
  CategoryDto,
  CategoryUpdateInput,
  LocalityCreateInput,
  LocalityDto,
  LocalityLevel,
} from "@skillconnect/shared";
import type { PrismaClient } from "../../generated/prisma/index.js";

interface RawLocalityRow {
  id: string;
  parentId: string | null;
  level: LocalityLevel;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  isServiceable: boolean;
}

export function createCatalogRepository(prisma: PrismaClient) {
  const listCategories = async (activeOnly: boolean): Promise<CategoryDto[]> => {
    return prisma.category.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,
      },
    });
  };

  const findCategoryById = async (id: string): Promise<CategoryDto | null> => {
    return prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,
      },
    });
  };

  const findCategoryBySlug = async (slug: string): Promise<CategoryDto | null> => {
    return prisma.category.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,
      },
    });
  };

  const createCategory = async (input: CategoryCreateInput): Promise<CategoryDto> => {
    return prisma.category.create({
      data: input,
      select: {
        id: true,
        name: true,
        slug: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,
      },
    });
  };

  const updateCategory = async (
    id: string,
    input: CategoryUpdateInput
  ): Promise<CategoryDto> => {
    return prisma.category.update({
      where: { id },
      data: input,
      select: {
        id: true,
        name: true,
        slug: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,
      },
    });
  };

  const listLocalities = async (): Promise<LocalityDto[]> => {
    return prisma.$queryRaw<RawLocalityRow[]>`
      SELECT
        id,
        parent_id AS "parentId",
        level::text AS level,
        name,
        slug,
        ST_Y(center::geometry) AS lat,
        ST_X(center::geometry) AS lng,
        is_serviceable AS "isServiceable"
      FROM localities
      ORDER BY level ASC, name ASC
    `;
  };

  const findLocalityById = async (id: string): Promise<LocalityDto | null> => {
    const rows = await prisma.$queryRaw<RawLocalityRow[]>`
      SELECT
        id,
        parent_id AS "parentId",
        level::text AS level,
        name,
        slug,
        ST_Y(center::geometry) AS lat,
        ST_X(center::geometry) AS lng,
        is_serviceable AS "isServiceable"
      FROM localities
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  };

  const findLocalityBySlug = async (slug: string): Promise<LocalityDto | null> => {
    const rows = await prisma.$queryRaw<RawLocalityRow[]>`
      SELECT
        id,
        parent_id AS "parentId",
        level::text AS level,
        name,
        slug,
        ST_Y(center::geometry) AS lat,
        ST_X(center::geometry) AS lng,
        is_serviceable AS "isServiceable"
      FROM localities
      WHERE slug = ${slug}
      LIMIT 1
    `;
    return rows[0] ?? null;
  };

  const createLocality = async (input: LocalityCreateInput): Promise<LocalityDto> => {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO localities (id, parent_id, level, name, slug, center, is_serviceable, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${input.parentId}::uuid,
        ${input.level}::"LocalityLevel",
        ${input.name},
        ${input.slug},
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
        ${input.isServiceable},
        NOW(),
        NOW()
      )
    `;
    const created = await findLocalityById(id);
    if (!created) throw new Error("Failed to read created locality");
    return created;
  };

  const updateLocality = async (
    id: string,
    next: {
      name: string;
      slug: string;
      level: LocalityLevel;
      parentId: string | null;
      lat: number;
      lng: number;
      isServiceable: boolean;
    }
  ): Promise<LocalityDto> => {
    await prisma.$executeRaw`
      UPDATE localities
      SET
        parent_id = ${next.parentId}::uuid,
        level = ${next.level}::"LocalityLevel",
        name = ${next.name},
        slug = ${next.slug},
        center = ST_SetSRID(ST_MakePoint(${next.lng}, ${next.lat}), 4326)::geography,
        is_serviceable = ${next.isServiceable},
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
    const updated = await findLocalityById(id);
    if (!updated) throw new Error("Failed to read updated locality");
    return updated;
  };

  const findNearestServiceableWithin = async (
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<LocalityDto | null> => {
    const radiusMeters = radiusKm * 1000;
    const rows = await prisma.$queryRaw<RawLocalityRow[]>`
      SELECT
        id,
        parent_id AS "parentId",
        level::text AS level,
        name,
        slug,
        ST_Y(center::geometry) AS lat,
        ST_X(center::geometry) AS lng,
        is_serviceable AS "isServiceable"
      FROM localities
      WHERE is_serviceable = true
        AND ST_DWithin(
          center,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY ST_Distance(
        center,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) ASC
      LIMIT 1
    `;
    return rows[0] ?? null;
  };

  return {
    listCategories,
    findCategoryById,
    findCategoryBySlug,
    createCategory,
    updateCategory,
    listLocalities,
    findLocalityById,
    findLocalityBySlug,
    createLocality,
    updateLocality,
    findNearestServiceableWithin,
  };
}
