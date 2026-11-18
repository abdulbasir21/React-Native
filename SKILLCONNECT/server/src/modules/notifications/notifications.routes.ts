import {
  deletePushTokenSchema,
  registerPushTokenSchema,
  uuidParamSchema,
} from "@skillconnect/shared";
import { Router, type RequestHandler } from "express";
import { validate } from "../../middleware/validate.js";
import type { createNotificationsController } from "./notifications.controller.js";

export function createNotificationsRouter(
  controller: ReturnType<typeof createNotificationsController>,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.use(authenticate);

  router.get("/", controller.listMy);
  router.post("/read-all", controller.markAllRead);
  router.post(
    "/:id/read",
    validate({ params: uuidParamSchema }),
    controller.markRead
  );
  router.post(
    "/push-token",
    validate({ body: registerPushTokenSchema }),
    controller.registerPushToken
  );
  router.delete(
    "/push-token",
    validate({ body: deletePushTokenSchema }),
    controller.deletePushToken
  );

  return router;
}
