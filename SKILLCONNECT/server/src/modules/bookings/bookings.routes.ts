import { Router, type RequestHandler } from "express";
import {
  cancelBookingSchema,
  createReviewSchema,
  reportIssueSchema,
  reportNoShowSchema,
  respondNoShowSchema,
  uuidParamSchema,
} from "@skillconnect/shared";
import { validate } from "../../middleware/validate.js";
import type { createReviewsController } from "../reviews/reviews.controller.js";
import type { createBookingsController } from "./bookings.controller.js";

export function createBookingsRouter(
  controller: ReturnType<typeof createBookingsController>,
  authenticate: RequestHandler,
  reviewsController?: ReturnType<typeof createReviewsController>
): Router {
  const router = Router();
  router.use(authenticate);

  router.get("/", controller.listMy);
  router.get(
    "/:id",
    validate({ params: uuidParamSchema }),
    controller.getDetail
  );
  router.post(
    "/:id/complete",
    validate({ params: uuidParamSchema }),
    controller.complete
  );
  router.post(
    "/:id/confirm",
    validate({ params: uuidParamSchema }),
    controller.confirm
  );
  router.post(
    "/:id/cancel",
    validate({ params: uuidParamSchema, body: cancelBookingSchema }),
    controller.cancel
  );
  router.post(
    "/:id/no-show",
    validate({ params: uuidParamSchema, body: reportNoShowSchema }),
    controller.reportNoShow
  );
  router.post(
    "/:id/no-show/respond",
    validate({ params: uuidParamSchema, body: respondNoShowSchema }),
    controller.respondNoShow
  );
  router.post(
    "/:id/issue",
    validate({ params: uuidParamSchema, body: reportIssueSchema }),
    controller.reportIssue
  );
  if (reviewsController) {
    router.post(
      "/:id/review",
      validate({ params: uuidParamSchema, body: createReviewSchema }),
      reviewsController.createReview
    );
  }

  return router;
}
