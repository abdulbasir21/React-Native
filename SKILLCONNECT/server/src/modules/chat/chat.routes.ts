import { Router, type RequestHandler } from "express";
import {
  createOfferSchema,
  markReadSchema,
  messagesQuerySchema,
  sendMessageSchema,
  startConversationSchema,
  uuidParamSchema,
} from "@skillconnect/shared";
import { createMessageRateLimiter } from "../../middleware/rateLimit.js";
import { validate } from "../../middleware/validate.js";
import type { createOffersController } from "../offers/offers.controller.js";
import type { createChatController } from "./chat.controller.js";

export function createChatRouter(
  controller: ReturnType<typeof createChatController>,
  authenticate: RequestHandler,
  enableRateLimit = true,
  offersController?: ReturnType<typeof createOffersController>
): Router {
  const router = Router();
  const messageLimiter = createMessageRateLimiter();

  router.use(authenticate);

  router.post(
    "/",
    validate({ body: startConversationSchema }),
    controller.startConversation
  );
  router.get("/", controller.listConversations);
  router.get(
    "/:id",
    validate({ params: uuidParamSchema }),
    controller.getConversation
  );
  router.get(
    "/:id/messages",
    validate({ params: uuidParamSchema, query: messagesQuerySchema }),
    controller.getMessages
  );
  router.post(
    "/:id/messages",
    ...(enableRateLimit ? [messageLimiter] : []),
    validate({ params: uuidParamSchema, body: sendMessageSchema }),
    controller.sendMessage
  );
  router.post(
    "/:id/read",
    validate({ params: uuidParamSchema, body: markReadSchema }),
    controller.markRead
  );

  if (offersController) {
    router.get(
      "/:id/offers",
      validate({ params: uuidParamSchema }),
      offersController.listForConversation
    );
    router.post(
      "/:id/offers",
      validate({ params: uuidParamSchema, body: createOfferSchema }),
      offersController.create
    );
  }

  return router;
}
