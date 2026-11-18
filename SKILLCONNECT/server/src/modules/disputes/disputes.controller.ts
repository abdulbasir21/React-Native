import type { NextFunction, Request, Response } from "express";
import type { DisputeStatus } from "@skillconnect/shared";
import { sendSuccess } from "../../lib/response.js";
import type { createDisputesService } from "./disputes.service.js";

export function createDisputesController(
  service: ReturnType<typeof createDisputesService>
) {
  const listAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, limit, offset } = req.query as unknown as {
        status?: DisputeStatus;
        limit: number;
        offset: number;
      };
      const result = await service.listAdminDisputes({ status, limit, offset });
      sendSuccess(
        res,
        { disputes: result.items },
        200,
        { total: result.total, limit, offset }
      );
    } catch (err) {
      next(err);
    }
  };

  const getDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dispute = await service.getAdminDisputeDetail(
        String(req.params.id)
      );
      sendSuccess(res, { dispute });
    } catch (err) {
      next(err);
    }
  };

  const getConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const messages = await service.getDisputedConversation(
        String(req.params.id)
      );
      sendSuccess(res, { messages });
    } catch (err) {
      next(err);
    }
  };

  const resolve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dispute = await service.resolveDispute(
        String(req.params.id),
        req.user!.id,
        req.body.outcome,
        req.body.resolutionNote
      );
      sendSuccess(res, { dispute });
    } catch (err) {
      next(err);
    }
  };

  return { listAdmin, getDetail, getConversation, resolve };
}
