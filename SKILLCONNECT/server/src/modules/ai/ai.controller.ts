import type {
  AiChatAssistInput,
  AiStructureOfferInput,
  AiUnderstandRequestInput,
} from "@skillconnect/shared";
import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../../lib/response.js";
import type { createAiService } from "./ai.service.js";

export function createAiController(
  service: ReturnType<typeof createAiService>
) {
  const understand = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await service.understandServiceRequest(
        req.user!.id,
        req.body as AiUnderstandRequestInput
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const structureOffer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await service.structureOffer(
        req.user!.id,
        req.body as AiStructureOfferInput
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  const chatAssist = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await service.assistChat(
        req.user!.id,
        String(req.params.id),
        req.body as AiChatAssistInput
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  return { understand, structureOffer, chatAssist };
}
