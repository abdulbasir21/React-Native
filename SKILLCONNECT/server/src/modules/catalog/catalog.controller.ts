import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createCatalogService } from "./catalog.service.js";

export function createCatalogController(
  service: ReturnType<typeof createCatalogService>
) {
  const getPublicCategories = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const categories = await service.listPublicCategories();
      sendSuccess(res, { categories });
    } catch (err) {
      next(err);
    }
  };

  const getAdminCategories = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const categories = await service.listAdminCategories();
      sendSuccess(res, { categories });
    } catch (err) {
      next(err);
    }
  };

  const createCategory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const category = await service.createCategory(req.body);
      sendSuccess(res, { category }, 201);
    } catch (err) {
      next(err);
    }
  };

  const updateCategory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const category = await service.updateCategory(String(req.params.id), req.body);
      sendSuccess(res, { category });
    } catch (err) {
      next(err);
    }
  };

  const getLocalities = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const localities = await service.listLocalities();
      sendSuccess(res, { localities });
    } catch (err) {
      next(err);
    }
  };

  const checkLocation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { lat, lng } = req.query as unknown as { lat: number; lng: number };
      const result = await service.checkLocationInServiceArea(lat, lng);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const createLocality = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const locality = await service.createLocality(req.body);
      sendSuccess(res, { locality }, 201);
    } catch (err) {
      next(err);
    }
  };

  const updateLocality = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const locality = await service.updateLocality(String(req.params.id), req.body);
      sendSuccess(res, { locality });
    } catch (err) {
      next(err);
    }
  };

  const bulkUpsertLocalities = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const localities = await service.bulkUpsertLocalities(req.body.localities);
      sendSuccess(res, { localities });
    } catch (err) {
      next(err);
    }
  };

  return {
    getPublicCategories,
    getAdminCategories,
    createCategory,
    updateCategory,
    getLocalities,
    checkLocation,
    createLocality,
    updateLocality,
    bulkUpsertLocalities,
  };
}
