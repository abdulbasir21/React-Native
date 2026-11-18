import type { CreateReviewInput } from "@skillconnect/shared";
import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createReviewsService } from "./reviews.service.js";

export function createReviewsController(
  service: ReturnType<typeof createReviewsService>
) {
  const createReview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const review = await service.createReview(
        String(req.params.id),
        req.user!.id,
        req.body as CreateReviewInput
      );
      sendSuccess(res, review, 201);
    } catch (err) {
      next(err);
    }
  };

  const listProviderReviews = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await service.listProviderReviews(
        String(req.params.id),
        req.user ? { id: req.user.id, roles: req.user.roles } : undefined
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  return { createReview, listProviderReviews };
}
