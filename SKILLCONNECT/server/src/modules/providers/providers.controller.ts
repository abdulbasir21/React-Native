import type { NextFunction, Request, Response } from "express";
import type { ProviderStatus } from "@skillconnect/shared";
import { sendSuccess } from "../../lib/response.js";
import type { createProvidersService } from "./providers.service.js";

export function createProvidersController(
  service: ReturnType<typeof createProvidersService>
) {
  const startOnboarding = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.startOnboarding(
        req.user!.id,
        req.user!.fullName
      );
      sendSuccess(res, { profile }, 201);
    } catch (err) {
      next(err);
    }
  };

  const getOwnProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.getOwnProfile(req.user!.id);
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const updateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.updateProfile(req.user!.id, req.body);
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const updateServices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.updateServices(
        req.user!.id,
        req.body.services
      );
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const updateServiceArea = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.updateServiceArea(req.user!.id, req.body);
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const updateAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.updateAvailability(
        req.user!.id,
        req.body.windows
      );
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const addPortfolioItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.addPortfolioItem(req.user!.id, req.body);
      sendSuccess(res, { profile }, 201);
    } catch (err) {
      next(err);
    }
  };

  const deletePortfolioItem = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.deletePortfolioItem(
        req.user!.id,
        String(req.params.mediaId)
      );
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const submitForApproval = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.submitForApproval(req.user!.id);
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const getPublicProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.getPublicProfile(
        String(req.params.id),
        req.user
      );
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const listAdminProviders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { status, limit, offset } = req.query as unknown as {
        status?: ProviderStatus;
        limit: number;
        offset: number;
      };
      const result = await service.listAdminProviders({ status, limit, offset });
      sendSuccess(
        res,
        { providers: result.items },
        200,
        { total: result.total, limit, offset }
      );
    } catch (err) {
      next(err);
    }
  };

  const getAdminProviderDetail = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.getAdminProviderDetail(
        String(req.params.id)
      );
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  const applyAdminDecision = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const profile = await service.applyAdminDecision(
        String(req.params.id),
        req.user!.id,
        req.body.decision,
        req.body.reason
      );
      sendSuccess(res, { profile });
    } catch (err) {
      next(err);
    }
  };

  return {
    startOnboarding,
    getOwnProfile,
    updateProfile,
    updateServices,
    updateServiceArea,
    updateAvailability,
    addPortfolioItem,
    deletePortfolioItem,
    submitForApproval,
    getPublicProfile,
    listAdminProviders,
    getAdminProviderDetail,
    applyAdminDecision,
  };
}
