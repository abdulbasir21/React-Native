import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  LocalityCreateInput,
  LocalityLevel,
  LocalityUpdateInput,
  LocationCheckDto,
} from "@skillconnect/shared";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { createCatalogRepository } from "./catalog.repository.js";

export function createCatalogService(
  repo: ReturnType<typeof createCatalogRepository>,
  config: AppConfig
) {
  const validateHierarchy = async (
    level: LocalityLevel,
    parentId: string | null,
    selfId?: string
  ) => {
    if (selfId && parentId === selfId) {
      throw new AppError(422, "INVALID_HIERARCHY", "Locality cannot be its own parent");
    }

    if (level === "PROVINCE") {
      if (parentId !== null) {
        throw new AppError(422, "INVALID_HIERARCHY", "PROVINCE cannot have a parent");
      }
      return;
    }

    if (!parentId) {
      throw new AppError(
        422,
        "INVALID_HIERARCHY",
        `${level} must reference a parent locality`
      );
    }

    const parent = await repo.findLocalityById(parentId);
    if (!parent) {
      throw new AppError(422, "INVALID_HIERARCHY", "Parent locality not found");
    }

    const expectedParentLevel: LocalityLevel =
      level === "DISTRICT" ? "PROVINCE" : "DISTRICT";
    if (parent.level !== expectedParentLevel) {
      throw new AppError(
        422,
        "INVALID_HIERARCHY",
        `${level} must have a parent of level ${expectedParentLevel}`
      );
    }
  };

  const listPublicCategories = () => repo.listCategories(true);
  const listAdminCategories = () => repo.listCategories(false);

  const createCategory = async (input: CategoryCreateInput) => {
    const existing = await repo.findCategoryBySlug(input.slug);
    if (existing) {
      throw new AppError(409, "DUPLICATE_SLUG", "Category slug already exists");
    }
    return repo.createCategory(input);
  };

  const updateCategory = async (id: string, input: CategoryUpdateInput) => {
    const existing = await repo.findCategoryById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Category not found");
    }
    if (input.slug && input.slug !== existing.slug) {
      const slugOwner = await repo.findCategoryBySlug(input.slug);
      if (slugOwner) {
        throw new AppError(409, "DUPLICATE_SLUG", "Category slug already exists");
      }
    }
    return repo.updateCategory(id, input);
  };

  const listLocalities = () => repo.listLocalities();

  const createLocality = async (input: LocalityCreateInput) => {
    const existing = await repo.findLocalityBySlug(input.slug);
    if (existing) {
      throw new AppError(409, "DUPLICATE_SLUG", "Locality slug already exists");
    }
    await validateHierarchy(input.level, input.parentId);
    return repo.createLocality(input);
  };

  const updateLocality = async (id: string, input: LocalityUpdateInput) => {
    const existing = await repo.findLocalityById(id);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Locality not found");
    }

    const nextSlug = input.slug ?? existing.slug;
    if (nextSlug !== existing.slug) {
      const slugOwner = await repo.findLocalityBySlug(nextSlug);
      if (slugOwner) {
        throw new AppError(409, "DUPLICATE_SLUG", "Locality slug already exists");
      }
    }

    const nextLevel = input.level ?? existing.level;
    const nextParentId =
      input.parentId !== undefined ? input.parentId : existing.parentId;
    await validateHierarchy(nextLevel, nextParentId, id);

    return repo.updateLocality(id, {
      name: input.name ?? existing.name,
      slug: nextSlug,
      level: nextLevel,
      parentId: nextParentId,
      lat: input.lat ?? existing.lat,
      lng: input.lng ?? existing.lng,
      isServiceable: input.isServiceable ?? existing.isServiceable,
    });
  };

  const bulkUpsertLocalities = async (
    items: (LocalityCreateInput & { parentSlug?: string | null })[]
  ) => {
    const createdOrUpdated = [];
    for (const item of items) {
      let parentId = item.parentId;
      if (!parentId && item.parentSlug) {
        const parent = await repo.findLocalityBySlug(item.parentSlug);
        if (!parent) {
          throw new AppError(
            422,
            "INVALID_HIERARCHY",
            `Parent slug not found: ${item.parentSlug}`
          );
        }
        parentId = parent.id;
      }

      const existing = await repo.findLocalityBySlug(item.slug);
      await validateHierarchy(item.level, parentId, existing?.id);

      if (existing) {
        createdOrUpdated.push(
          await repo.updateLocality(existing.id, {
            name: item.name,
            slug: item.slug,
            level: item.level,
            parentId,
            lat: item.lat,
            lng: item.lng,
            isServiceable: item.isServiceable,
          })
        );
      } else {
        createdOrUpdated.push(
          await repo.createLocality({
            name: item.name,
            slug: item.slug,
            level: item.level,
            parentId,
            lat: item.lat,
            lng: item.lng,
            isServiceable: item.isServiceable,
          })
        );
      }
    }
    return createdOrUpdated;
  };

  const checkLocationInServiceArea = async (
    lat: number,
    lng: number
  ): Promise<LocationCheckDto> => {
    const nearest = await repo.findNearestServiceableWithin(
      lat,
      lng,
      config.LOCATION_MATCH_RADIUS_KM
    );
    return {
      outsideServiceArea: nearest === null,
      radiusKm: config.LOCATION_MATCH_RADIUS_KM,
      nearestLocality: nearest,
    };
  };

  return {
    listPublicCategories,
    listAdminCategories,
    createCategory,
    updateCategory,
    listLocalities,
    createLocality,
    updateLocality,
    bulkUpsertLocalities,
    checkLocationInServiceArea,
  };
}
