import type { NextFunction, Request, Response } from "express";
import type { Server } from "socket.io";
import { sendSuccess } from "../../lib/response.js";
import type { createOffersService } from "./offers.service.js";

export function createOffersController(
  service: ReturnType<typeof createOffersService>,
  getIo?: () => Server | null
) {
  const listForConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const offers = await service.listConversationOffers(
        String(req.params.id),
        req.user!.id
      );
      sendSuccess(res, { offers });
    } catch (err) {
      next(err);
    }
  };

  const create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = String(req.params.id);
      const result = await service.createOffer(
        conversationId,
        req.user!.id,
        req.body
      );

      const io = getIo?.();
      if (io) {
        io.to(`conversation:${conversationId}`).emit("message:new", {
          message: result.message,
        });
        io.to(`user:${result.customerUserId}`).emit("offer:updated", {
          conversationId,
          offer: result.offer,
        });
      }

      sendSuccess(res, { offer: result.offer }, 201);
    } catch (err) {
      next(err);
    }
  };

  const withdraw = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.withdrawOffer(
        String(req.params.id),
        req.user!.id
      );
      const io = getIo?.();
      if (io) {
        io.to(`user:${result.customerUserId}`).emit("offer:updated", {
          conversationId: result.offer.conversationId,
          offer: result.offer,
        });
      }
      sendSuccess(res, { offer: result.offer });
    } catch (err) {
      next(err);
    }
  };

  const decline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.declineOffer(
        String(req.params.id),
        req.user!.id
      );
      const io = getIo?.();
      if (io) {
        io.to(`user:${result.providerUserId}`).emit("offer:updated", {
          conversationId: result.offer.conversationId,
          offer: result.offer,
        });
      }
      sendSuccess(res, { offer: result.offer });
    } catch (err) {
      next(err);
    }
  };

  const accept = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.acceptOffer(
        String(req.params.id),
        req.user!.id,
        req.body
      );

      const io = getIo?.();
      if (io && !result.alreadyExisted) {
        io.to(`user:${result.providerUserId}`).emit("booking:updated", {
          bookingId: result.booking.id,
          conversationId: result.booking.conversationId,
        });
        io.to(`user:${result.booking.customerUserId}`).emit("offer:updated", {
          conversationId: result.booking.conversationId,
        });
      }

      sendSuccess(
        res,
        { booking: result.booking },
        result.alreadyExisted ? 200 : 201
      );
    } catch (err) {
      next(err);
    }
  };

  return { listForConversation, create, withdraw, decline, accept };
}
