import { Router, type RequestHandler } from "express";
import {
  adminDisputesQuerySchema,
  adminProvidersQuerySchema,
  adminUsersQuerySchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  localityBulkSchema,
  localityCreateSchema,
  localityUpdateSchema,
  providerAdminDecisionSchema,
  resolveDisputeSchema,
  userActionSchema,
  uuidParamSchema,
} from "@skillconnect/shared";
import { sendSuccess } from "../../lib/response.js";
import { validate } from "../../middleware/validate.js";
import type { createCatalogController } from "../catalog/catalog.controller.js";
import type { createDisputesController } from "../disputes/disputes.controller.js";
import type { createProvidersController } from "../providers/providers.controller.js";
import type { createAdminDashboardController } from "./dashboard.controller.js";

export function createAdminRouter(
  authenticate: RequestHandler,
  requireAdmin: RequestHandler,
  catalogController?: ReturnType<typeof createCatalogController>,
  providersController?: ReturnType<typeof createProvidersController>,
  disputesController?: ReturnType<typeof createDisputesController>,
  dashboardController?: ReturnType<typeof createAdminDashboardController>
): Router {
  const router = Router();
  router.use(authenticate, requireAdmin);

  router.get("/me", (req, res) => {
    sendSuccess(res, { user: req.user });
  });

  if (dashboardController) {
    router.get("/dashboard", dashboardController.getDashboard);
    router.get(
      "/users",
      validate({ query: adminUsersQuerySchema }),
      dashboardController.listUsers
    );
    router.post(
      "/users/:id/suspend",
      validate({ params: uuidParamSchema, body: userActionSchema }),
      dashboardController.suspendUser
    );
    router.post(
      "/users/:id/reinstate",
      validate({ params: uuidParamSchema }),
      dashboardController.reinstateUser
    );
  }

  if (catalogController) {
    router.get("/categories", catalogController.getAdminCategories);
    router.post(
      "/categories",
      validate({ body: categoryCreateSchema }),
      catalogController.createCategory
    );
    router.patch(
      "/categories/:id",
      validate({ params: uuidParamSchema, body: categoryUpdateSchema }),
      catalogController.updateCategory
    );

    router.get("/localities", catalogController.getLocalities);
    router.post(
      "/localities",
      validate({ body: localityCreateSchema }),
      catalogController.createLocality
    );
    router.post(
      "/localities/bulk",
      validate({ body: localityBulkSchema }),
      catalogController.bulkUpsertLocalities
    );
    router.patch(
      "/localities/:id",
      validate({ params: uuidParamSchema, body: localityUpdateSchema }),
      catalogController.updateLocality
    );
  }

  if (providersController) {
    router.get(
      "/providers",
      validate({ query: adminProvidersQuerySchema }),
      providersController.listAdminProviders
    );
    router.get(
      "/providers/:id",
      validate({ params: uuidParamSchema }),
      providersController.getAdminProviderDetail
    );
    router.post(
      "/providers/:id/decision",
      validate({ params: uuidParamSchema, body: providerAdminDecisionSchema }),
      providersController.applyAdminDecision
    );
  }

  if (disputesController) {
    router.get(
      "/disputes",
      validate({ query: adminDisputesQuerySchema }),
      disputesController.listAdmin
    );
    router.get(
      "/disputes/:id",
      validate({ params: uuidParamSchema }),
      disputesController.getDetail
    );
    router.get(
      "/disputes/:id/conversation",
      validate({ params: uuidParamSchema }),
      disputesController.getConversation
    );
    router.post(
      "/disputes/:id/resolve",
      validate({ params: uuidParamSchema, body: resolveDisputeSchema }),
      disputesController.resolve
    );
  }

  return router;
}
