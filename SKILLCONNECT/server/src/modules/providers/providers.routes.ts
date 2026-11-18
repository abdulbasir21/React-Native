import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import {
  availabilityUpdateSchema,
  portfolioCreateSchema,
  providerProfileUpdateSchema,
  providerSearchQuerySchema,
  providerServicesUpdateSchema,
  serviceAreaUpdateSchema,
  uuidParamSchema,
} from "@skillconnect/shared";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { AppConfig } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { validate } from "../../middleware/validate.js";
import type { createAdminDashboardController } from "../admin/dashboard.controller.js";
import type { createDiscoveryController } from "../discovery/discovery.controller.js";
import type { createReviewsController } from "../reviews/reviews.controller.js";
import type { createProvidersController } from "./providers.controller.js";

const mediaParamSchema = z.object({
  mediaId: z.string().uuid(),
});

/**
 * Optional auth middleware for public provider profiles so owners and admins
 * can still view non-approved profiles while guests see 404.
 */
function createOptionalAuthenticate(prisma: PrismaClient, config: AppConfig) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : undefined;
      const cookieToken = req.cookies?.accessToken as string | undefined;
      const token = bearerToken || cookieToken;
      if (!token) return next();

      const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as { sub?: string };
      if (!payload.sub) return next();

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: true },
      });
      if (user && user.status === "ACTIVE") {
        req.user = {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          status: user.status,
          roles: user.roles.map((r) => r.role),
        };
      }
      next();
    } catch {
      next();
    }
  };
}

export function createProviderSelfRouter(
  controller: ReturnType<typeof createProvidersController>,
  authenticate: RequestHandler,
  requireProvider: RequestHandler,
  dashboardController?: ReturnType<typeof createAdminDashboardController>
): Router {
  const router = Router();
  router.use(authenticate);

  // AUTH-2: Starting onboarding adds PROVIDER role and creates DRAFT profile
  router.post("/onboarding", controller.startOnboarding);

  router.use(requireProvider);
  if (dashboardController) {
    router.get("/dashboard", dashboardController.getProviderDashboard);
  }
  router.get("/profile", controller.getOwnProfile);
  router.put(
    "/profile",
    validate({ body: providerProfileUpdateSchema }),
    controller.updateProfile
  );
  router.put(
    "/services",
    validate({ body: providerServicesUpdateSchema }),
    controller.updateServices
  );
  router.put(
    "/service-area",
    validate({ body: serviceAreaUpdateSchema }),
    controller.updateServiceArea
  );
  router.put(
    "/availability",
    validate({ body: availabilityUpdateSchema }),
    controller.updateAvailability
  );
  router.post(
    "/portfolio",
    validate({ body: portfolioCreateSchema }),
    controller.addPortfolioItem
  );
  router.delete(
    "/portfolio/:mediaId",
    validate({ params: mediaParamSchema }),
    controller.deletePortfolioItem
  );
  router.post("/submit", controller.submitForApproval);

  return router;
}

export function createPublicProvidersRouter(
  controller: ReturnType<typeof createProvidersController>,
  prisma: PrismaClient,
  config: AppConfig,
  discoveryController?: ReturnType<typeof createDiscoveryController>,
  reviewsController?: ReturnType<typeof createReviewsController>
): Router {
  const router = Router();
  const optionalAuth = createOptionalAuthenticate(prisma, config);

  if (discoveryController) {
    router.get(
      "/search",
      validate({ query: providerSearchQuerySchema }),
      discoveryController.search
    );
  }

  router.get(
    "/:id",
    optionalAuth,
    validate({ params: uuidParamSchema }),
    controller.getPublicProfile
  );
  if (reviewsController) {
    router.get(
      "/:id/reviews",
      optionalAuth,
      validate({ params: uuidParamSchema }),
      reviewsController.listProviderReviews
    );
  }

  return router;
}
