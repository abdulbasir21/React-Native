import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createMapsService } from "./maps.service.js";

export function createMapsController(
  service: ReturnType<typeof createMapsService>
) {
  const autocomplete = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const q = String(req.query.q);
      const lat =
        req.query.lat !== undefined ? Number(req.query.lat) : undefined;
      const lng =
        req.query.lng !== undefined ? Number(req.query.lng) : undefined;
      const result = await service.autocompletePlaces(q, lat, lng);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const details = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.getPlaceDetails(String(req.query.placeId));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const travelEstimate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const estimate = await service.getTravelEstimate(
        String(req.query.providerProfileId),
        Number(req.query.originLat),
        Number(req.query.originLng)
      );
      sendSuccess(res, { estimate });
    } catch (err) {
      next(err);
    }
  };

  return { autocomplete, details, travelEstimate };
}
