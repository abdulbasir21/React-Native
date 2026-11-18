import {
  aiChatAssistSchema,
  aiStructureOfferSchema,
  aiUnderstandRequestSchema,
  uuidParamSchema,
} from "@skillconnect/shared";
import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate.js";
import type { createAiController } from "./ai.controller.js";

export function createAiRouter(
  controller: ReturnType<typeof createAiController>,
  authenticate: RequestHandler,
  requireProvider: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    "/understand",
    validate({ body: aiUnderstandRequestSchema }),
    controller.understand
  );
  router.post(
    "/structure-offer",
    requireProvider,
    validate({ body: aiStructureOfferSchema }),
    controller.structureOffer
  );
  router.post(
    "/conversations/:id/assist",
    validate({ params: uuidParamSchema, body: aiChatAssistSchema }),
    controller.chatAssist
  );

  return router;
}
