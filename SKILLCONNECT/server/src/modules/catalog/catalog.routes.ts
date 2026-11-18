import { Router } from "express";
import { locationCheckQuerySchema } from "@skillconnect/shared";
import { validate } from "../../middleware/validate.js";
import type { createCatalogController } from "./catalog.controller.js";

export function createPublicCatalogRouter(
  controller: ReturnType<typeof createCatalogController>
): Router {
  const router = Router();

  router.get("/categories", controller.getPublicCategories);
  router.get("/localities", controller.getLocalities);
  router.get(
    "/localities/check",
    validate({ query: locationCheckQuerySchema }),
    controller.checkLocation
  );

  return router;
}
