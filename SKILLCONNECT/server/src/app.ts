import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Server } from "socket.io";
import type { AppConfig } from "./config/env.js";
import type { PrismaClient } from "./generated/prisma/index.js";
import { createImageKitStorage, type ImageStorageAdapter } from "./lib/upload.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { createApiRateLimiter } from "./middleware/rateLimit.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { createAdminDashboardController } from "./modules/admin/dashboard.controller.js";
import { createAdminDashboardService } from "./modules/admin/dashboard.service.js";
import { createAiController } from "./modules/ai/ai.controller.js";
import { createAiRouter } from "./modules/ai/ai.routes.js";
import {
  createAiService,
  type GeminiJsonGenerator,
} from "./modules/ai/ai.service.js";
import { createAuthController } from "./modules/auth/auth.controller.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createBookingsController } from "./modules/bookings/bookings.controller.js";
import { createBookingsRouter } from "./modules/bookings/bookings.routes.js";
import { createBookingsService } from "./modules/bookings/bookings.service.js";
import { createCatalogController } from "./modules/catalog/catalog.controller.js";
import { createCatalogRepository } from "./modules/catalog/catalog.repository.js";
import { createPublicCatalogRouter } from "./modules/catalog/catalog.routes.js";
import { createCatalogService } from "./modules/catalog/catalog.service.js";
import { createChatController } from "./modules/chat/chat.controller.js";
import { createChatRepository } from "./modules/chat/chat.repository.js";
import { createChatRouter } from "./modules/chat/chat.routes.js";
import { createChatService } from "./modules/chat/chat.service.js";
import { createDiscoveryController } from "./modules/discovery/discovery.controller.js";
import { createDiscoveryRepository } from "./modules/discovery/discovery.repository.js";
import { createDiscoveryService } from "./modules/discovery/discovery.service.js";
import { createDisputesController } from "./modules/disputes/disputes.controller.js";
import { createDisputesService } from "./modules/disputes/disputes.service.js";
import { createMapsController } from "./modules/maps/maps.controller.js";
import { createMapsRouter } from "./modules/maps/maps.routes.js";
import {
  createMapsService,
  type FetchLike,
} from "./modules/maps/maps.service.js";
import { createNotificationsController } from "./modules/notifications/notifications.controller.js";
import { createNotificationsRouter } from "./modules/notifications/notifications.routes.js";
import { createNotificationsService } from "./modules/notifications/notifications.service.js";
import { createOffersController } from "./modules/offers/offers.controller.js";
import { createOffersRouter } from "./modules/offers/offers.routes.js";
import { createOffersService } from "./modules/offers/offers.service.js";
import { createProvidersController } from "./modules/providers/providers.controller.js";
import { createProvidersRepository } from "./modules/providers/providers.repository.js";
import {
  createProviderSelfRouter,
  createPublicProvidersRouter,
} from "./modules/providers/providers.routes.js";
import { createProvidersService } from "./modules/providers/providers.service.js";
import { createReviewsController } from "./modules/reviews/reviews.controller.js";
import { createReviewsService } from "./modules/reviews/reviews.service.js";
import { createUploadsRouter } from "./modules/uploads/uploads.routes.js";

export interface AppDependencies {
  config: AppConfig;
  prisma?: PrismaClient;
  checkDatabase: () => Promise<boolean>;
  imageStorage?: ImageStorageAdapter;
  uploadLimitPerHour?: number;
  getIo?: () => Server | null;
  aiGenerator?: GeminiJsonGenerator;
  aiMaxCallsPerHour?: number;
  mapsFetch?: FetchLike;
}

export function createApp({
  config,
  prisma,
  checkDatabase,
  imageStorage,
  uploadLimitPerHour,
  getIo,
  aiGenerator,
  aiMaxCallsPerHour,
  mapsFetch,
}: AppDependencies): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  if (config.NODE_ENV !== "test") {
    app.use("/api/v1", createApiRateLimiter());
  }

  app.get("/health", async (_req, res) => {
    try {
      const dbOk = await checkDatabase();
      if (!dbOk) {
        res.status(503).json({
          success: false,
          error: {
            code: "DB_UNAVAILABLE",
            message: "Database connection failed",
          },
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: {
          status: "ok",
          environment: config.NODE_ENV,
        },
      });
    } catch {
      res.status(503).json({
        success: false,
        error: {
          code: "DB_UNAVAILABLE",
          message: "Database connection failed",
        },
      });
    }
  });

  if (prisma) {
    const { authenticate, requireRole } = createAuthMiddleware(prisma, config);
    const storage = imageStorage ?? createImageKitStorage(config);

    const authService = createAuthService(prisma, config);
    const authController = createAuthController(authService, config);

    const catalogRepo = createCatalogRepository(prisma);
    const catalogService = createCatalogService(catalogRepo, config);
    const catalogController = createCatalogController(catalogService);

    const providersRepo = createProvidersRepository(prisma);
    const providersService = createProvidersService(prisma, providersRepo, storage);
    const providersController = createProvidersController(providersService);

    const discoveryRepo = createDiscoveryRepository(prisma);
    const discoveryService = createDiscoveryService(discoveryRepo);
    const discoveryController = createDiscoveryController(discoveryService);

    const chatRepo = createChatRepository(prisma);
    const chatService = createChatService(prisma, chatRepo);
    const chatController = createChatController(chatService, getIo);

    const offersService = createOffersService(prisma, config);
    const offersController = createOffersController(offersService, getIo);

    const bookingsService = createBookingsService(prisma, config);
    const bookingsController = createBookingsController(bookingsService);

    const disputesService = createDisputesService(prisma);
    const disputesController = createDisputesController(disputesService);

    const reviewsService = createReviewsService(prisma);
    const reviewsController = createReviewsController(reviewsService);

    const notificationsService = createNotificationsService(prisma);
    const notificationsController =
      createNotificationsController(notificationsService);

    const dashboardService = createAdminDashboardService(prisma);
    const dashboardController =
      createAdminDashboardController(dashboardService);

    const aiService = createAiService(
      prisma,
      config,
      aiGenerator,
      aiMaxCallsPerHour
    );
    const aiController = createAiController(aiService);

    const mapsService = createMapsService(prisma, config, mapsFetch);
    const mapsController = createMapsController(mapsService);

    app.use("/api/v1/auth", createAuthRouter(authController, authenticate));
    app.use("/api/v1", createPublicCatalogRouter(catalogController));
    app.use("/api/v1", createMapsRouter(mapsController));
    app.use(
      "/api/v1/ai",
      createAiRouter(aiController, authenticate, requireRole("PROVIDER"))
    );
    app.use(
      "/api/v1/conversations",
      createChatRouter(
        chatController,
        authenticate,
        config.NODE_ENV !== "test",
        offersController
      )
    );
    app.use("/api/v1/offers", createOffersRouter(offersController, authenticate));
    app.use(
      "/api/v1/bookings",
      createBookingsRouter(bookingsController, authenticate, reviewsController)
    );
    app.use(
      "/api/v1/notifications",
      createNotificationsRouter(notificationsController, authenticate)
    );
    app.use(
      "/api/v1/uploads",
      createUploadsRouter(authenticate, storage, uploadLimitPerHour)
    );
    app.use(
      "/api/v1/provider/me",
      createProviderSelfRouter(
        providersController,
        authenticate,
        requireRole("PROVIDER"),
        dashboardController
      )
    );
    app.use(
      "/api/v1/providers",
      createPublicProvidersRouter(
        providersController,
        prisma,
        config,
        discoveryController,
        reviewsController
      )
    );
    app.use(
      "/api/v1/admin",
      createAdminRouter(
        authenticate,
        requireRole("ADMIN"),
        catalogController,
        providersController,
        disputesController,
        dashboardController
      )
    );
  }

  app.use(errorHandler);

  return app;
}
