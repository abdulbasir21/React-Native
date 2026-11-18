import type {
  DeletePushTokenInput,
  RegisterPushTokenInput,
} from "@skillconnect/shared";
import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createNotificationsService } from "./notifications.service.js";

export function createNotificationsController(
  service: ReturnType<typeof createNotificationsService>
) {
  const listMy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
      const result = await service.listMyNotifications(
        req.user!.id,
        limit,
        offset
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await service.markRead(
        req.user!.id,
        String(req.params.id)
      );
      sendSuccess(res, { notification });
    } catch (err) {
      next(err);
    }
  };

  const markAllRead = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await service.markAllRead(req.user!.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const registerPushToken = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const token = await service.registerPushToken(
        req.user!.id,
        req.body as RegisterPushTokenInput
      );
      sendSuccess(res, { id: token.id }, 201);
    } catch (err) {
      next(err);
    }
  };

  const deletePushToken = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const body = req.body as DeletePushTokenInput;
      await service.deletePushToken(req.user!.id, body.expoPushToken);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  };

  return {
    listMy,
    markRead,
    markAllRead,
    registerPushToken,
    deletePushToken,
  };
}
