import { Router, type RequestHandler } from "express";
import { acceptOfferSchema, uuidParamSchema } from "@skillconnect/shared";
import { validate } from "../../middleware/validate.js";
import type { createOffersController } from "./offers.controller.js";

export function createOffersRouter(
  controller: ReturnType<typeof createOffersController>,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    "/:id/withdraw",
    validate({ params: uuidParamSchema }),
    controller.withdraw
  );
  router.post(
    "/:id/decline",
    validate({ params: uuidParamSchema }),
    controller.decline
  );
  router.post(
    "/:id/accept",
    validate({ params: uuidParamSchema, body: acceptOfferSchema }),
    controller.accept
  );

  return router;
}
