import type {
  AvailabilityInputWindow,
} from "../../domain/provider.js";
import {
  canTransitionProviderStatus,
  targetStatusForDecision,
  validateAvailabilityWindows,
  validateProviderSubmission,
} from "../../domain/provider.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";
import type { ImageStorageAdapter } from "../../lib/upload.js";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import type {
  OwnProviderProfileDto,
  ProviderStatus,
  VerificationDecision,
} from "@skillconnect/shared";
import type { createProvidersRepository } from "./providers.repository.js";

export function createProvidersService(
  prisma: PrismaClient,
  repo: ReturnType<typeof createProvidersRepository>,
  storage: ImageStorageAdapter
) {
  const getOwnProfile = async (userId: string): Promise<OwnProviderProfileDto> => {
    const loaded = await repo.loadFullProfileByWhere({ userId }, true);
    if (!loaded?.own) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }
    return loaded.own;
  };

  /**
   * AUTH-2, T2: Adds PROVIDER role and creates DRAFT ProviderProfile in one transaction.
   */
  const startOnboarding = async (
    userId: string,
    defaultDisplayName: string
  ): Promise<OwnProviderProfileDto> => {
    const existing = await repo.loadFullProfileByWhere({ userId }, true);
    if (existing?.own) {
      return existing.own;
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { userId_role: { userId, role: "PROVIDER" } },
        update: {},
        create: { userId, role: "PROVIDER" },
      });
      await tx.providerProfile.create({
        data: {
          userId,
          displayName: defaultDisplayName.slice(0, 60),
          status: "DRAFT",
          isAcceptingWork: true,
        },
      });
    });

    return getOwnProfile(userId);
  };

  /**
   * PRV-5: Editing profile preserves status (including APPROVED).
   */
  const updateProfile = async (
    userId: string,
    input: {
      displayName?: string;
      photoUrl?: string;
      photoFileId?: string;
      description?: string;
      experienceYears?: number;
      isAcceptingWork?: boolean;
    }
  ): Promise<OwnProviderProfileDto> => {
    const current = await repo.loadFullProfileByWhere({ userId }, true);
    if (!current?.own) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }

    await prisma.providerProfile.update({
      where: { userId },
      data: input,
    });

    if (
      input.photoFileId &&
      current.photoFileId &&
      input.photoFileId !== current.photoFileId
    ) {
      await storage.deleteBestEffort(current.photoFileId);
    }

    return getOwnProfile(userId);
  };

  const updateServices = async (
    userId: string,
    services: { categoryId: string; title: string; description: string }[]
  ): Promise<OwnProviderProfileDto> => {
    const profile = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }

    const categoryIds = Array.from(new Set(services.map((s) => s.categoryId)));
    const activeCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds }, isActive: true },
      select: { id: true },
    });
    if (activeCategories.length !== categoryIds.length) {
      throw new AppError(
        422,
        "INVALID_CATEGORY",
        "One or more selected categories are missing or inactive"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.providerService.deleteMany({
        where: { providerProfileId: profile.id },
      });
      await tx.providerService.createMany({
        data: services.map((s) => ({
          providerProfileId: profile.id,
          categoryId: s.categoryId,
          title: s.title,
          description: s.description,
        })),
      });
    });

    return getOwnProfile(userId);
  };

  const updateServiceArea = async (
    userId: string,
    input: { localityId: string; lat: number; lng: number; radiusKm: number }
  ): Promise<OwnProviderProfileDto> => {
    const profile = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }

    const locality = await prisma.locality.findUnique({
      where: { id: input.localityId },
      select: { id: true },
    });
    if (!locality) {
      throw new AppError(422, "INVALID_LOCALITY", "Selected locality not found");
    }

    await repo.upsertServiceArea(profile.id, input);
    return getOwnProfile(userId);
  };

  const updateAvailability = async (
    userId: string,
    windows: AvailabilityInputWindow[]
  ): Promise<OwnProviderProfileDto> => {
    const profile = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }

    const errs = validateAvailabilityWindows(windows);
    if (errs.length > 0) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        errs[0]!,
        errs.map((message) => ({ message }))
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.availabilityWindow.deleteMany({
        where: { providerProfileId: profile.id },
      });
      if (windows.length > 0) {
        await tx.availabilityWindow.createMany({
          data: windows.map((w) => ({
            providerProfileId: profile.id,
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
          })),
        });
      }
    });

    return getOwnProfile(userId);
  };

  const addPortfolioItem = async (
    userId: string,
    input: { imageUrl: string; fileId: string; caption?: string; sortOrder: number }
  ): Promise<OwnProviderProfileDto> => {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      include: { _count: { select: { portfolio: true } } },
    });
    if (!profile) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }
    if (profile._count.portfolio >= 10) {
      throw new AppError(
        422,
        "PORTFOLIO_LIMIT_REACHED",
        "Maximum 10 portfolio images allowed"
      );
    }

    await prisma.portfolioMedia.create({
      data: {
        providerProfileId: profile.id,
        imageUrl: input.imageUrl,
        fileId: input.fileId,
        caption: input.caption ?? null,
        sortOrder: input.sortOrder,
      },
    });

    return getOwnProfile(userId);
  };

  const deletePortfolioItem = async (
    userId: string,
    mediaId: string
  ): Promise<OwnProviderProfileDto> => {
    const profile = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }

    const item = await prisma.portfolioMedia.findFirst({
      where: { id: mediaId, providerProfileId: profile.id },
    });
    if (!item) {
      throw new AppError(404, "NOT_FOUND", "Portfolio item not found");
    }

    await prisma.portfolioMedia.delete({ where: { id: item.id } });
    await storage.deleteBestEffort(item.fileId);

    return getOwnProfile(userId);
  };

  const submitForApproval = async (userId: string): Promise<OwnProviderProfileDto> => {
    const loaded = await repo.loadFullProfileByWhere({ userId }, true);
    if (!loaded?.own) {
      throw new AppError(404, "NOT_FOUND", "Provider profile not found");
    }

    const p = loaded.own;
    if (!canTransitionProviderStatus(p.status, "PENDING")) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot submit profile from status ${p.status}`
      );
    }

    const missing = validateProviderSubmission({
      displayName: p.displayName,
      photoUrl: p.photoUrl,
      description: p.description,
      experienceYears: p.experienceYears,
      servicesCount: p.services.length,
      serviceArea: p.serviceArea ? { radiusKm: p.serviceArea.radiusKm } : null,
      portfolioCount: p.portfolio.length,
    });
    if (missing.length > 0) {
      throw new AppError(
        422,
        "INCOMPLETE_PROFILE",
        missing[0]!,
        missing.map((message) => ({ message }))
      );
    }

    await prisma.providerProfile.update({
      where: { id: p.id },
      data: { status: "PENDING", submittedAt: new Date() },
    });

    return getOwnProfile(userId);
  };

  const getPublicProfile = async (
    providerId: string,
    caller?: AuthenticatedUser
  ) => {
    const loaded = await repo.loadFullProfileByWhere({ id: providerId }, false);
    if (!loaded?.publicDto) {
      throw new AppError(404, "NOT_FOUND", "Provider not found");
    }

    const isOwner = caller?.id === loaded.publicDto.userId;
    const isAdmin = caller?.roles.includes("ADMIN") ?? false;
    const isPubliclyVisible =
      loaded.publicDto.status === "APPROVED" && loaded.userStatus === "ACTIVE";

    // PRV-3: Return 404 unless APPROVED+ACTIVE, or caller is owner/admin
    if (!isPubliclyVisible && !isOwner && !isAdmin) {
      throw new AppError(404, "NOT_FOUND", "Provider not found");
    }

    return loaded.publicDto;
  };

  const listAdminProviders = (params: {
    status?: ProviderStatus;
    limit: number;
    offset: number;
  }) => repo.listAdminProviders(params);

  const getAdminProviderDetail = async (providerId: string) => {
    const loaded = await repo.loadFullProfileByWhere({ id: providerId }, true);
    if (!loaded?.own) {
      throw new AppError(404, "NOT_FOUND", "Provider not found");
    }
    return loaded.own;
  };

  const applyAdminDecision = async (
    providerId: string,
    adminUserId: string,
    decision: VerificationDecision,
    reason?: string
  ) => {
    const loaded = await repo.loadFullProfileByWhere({ id: providerId }, true);
    if (!loaded?.own) {
      throw new AppError(404, "NOT_FOUND", "Provider not found");
    }

    const nextStatus = targetStatusForDecision(decision);
    if (!canTransitionProviderStatus(loaded.own.status, nextStatus)) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot apply ${decision} when provider status is ${loaded.own.status}`
      );
    }

    await repo.applyAdminDecisionTx({
      providerProfileId: providerId,
      userId: loaded.own.userId,
      nextStatus,
      decision,
      reason: reason ?? null,
      adminUserId,
    });

    return getAdminProviderDetail(providerId);
  };

  return {
    getOwnProfile,
    startOnboarding,
    updateProfile,
    updateServices,
    updateServiceArea,
    updateAvailability,
    addPortfolioItem,
    deletePortfolioItem,
    submitForApproval,
    getPublicProfile,
    listAdminProviders,
    getAdminProviderDetail,
    applyAdminDecision,
  };
}
