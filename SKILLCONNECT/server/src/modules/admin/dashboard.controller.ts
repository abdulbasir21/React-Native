import type { AdminUsersQuery, UserActionInput } from "@skillconnect/shared";
import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createAdminDashboardService } from "./dashboard.service.js";

export function createAdminDashboardController(
  service: ReturnType<typeof createAdminDashboardService>
) {
  const getDashboard = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const dashboard = await service.getAdminDashboard();
      sendSuccess(res, { dashboard });
    } catch (err) {
      next(err);
    }
  };

  const listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await service.listUsers(req.query as AdminUsersQuery);
      sendSuccess(res, { users });
    } catch (err) {
      next(err);
    }
  };

  const suspendUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const body = (req.body ?? {}) as UserActionInput;
      const user = await service.suspendUser(
        req.user!.id,
        String(req.params.id),
        body.reason
      );
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  };

  const reinstateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = await service.reinstateUser(String(req.params.id));
      sendSuccess(res, { user });
    } catch (err) {
      next(err);
    }
  };

  const getProviderDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const dashboard = await service.getProviderDashboard(req.user!.id);
      sendSuccess(res, { dashboard });
    } catch (err) {
      next(err);
    }
  };

  return {
    getDashboard,
    listUsers,
    suspendUser,
    reinstateUser,
    getProviderDashboard,
  };
}
