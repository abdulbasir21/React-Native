import {
  placeAutocompleteQuerySchema,
  placeDetailsQuerySchema,
  travelEstimateQuerySchema,
} from "@skillconnect/shared";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import type { createMapsController } from "./maps.controller.js";

export function createMapsRouter(
  controller: ReturnType<typeof createMapsController>
): Router {
  const router = Router();

  router.get(
    "/places/autocomplete",
    validate({ query: placeAutocompleteQuerySchema }),
    controller.autocomplete
  );
  router.get(
    "/places/details",
    validate({ query: placeDetailsQuerySchema }),
    controller.details
  );
  router.get(
    "/routes/estimate",
    validate({ query: travelEstimateQuerySchema }),
    controller.travelEstimate
  );

  return router;
}
