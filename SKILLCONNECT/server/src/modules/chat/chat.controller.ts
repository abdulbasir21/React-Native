import type { NextFunction, Request, Response } from "express";
import type { Server } from "socket.io";
import { sendSuccess } from "../../lib/response.js";
import type { createChatService } from "./chat.service.js";

export function createChatController(
  service: ReturnType<typeof createChatService>,
  getIo?: () => Server | null
) {
  const startConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const conversation = await service.startConversation(
        req.user!.id,
        req.body.providerProfileId
      );
      sendSuccess(res, { conversation }, 200);
    } catch (err) {
      next(err);
    }
  };

  const listConversations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const conversations = await service.listConversations(req.user!.id);
      sendSuccess(res, { conversations });
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
      const conversation = await service.getConversation(
        String(req.params.id),
        req.user!.id
      );
      sendSuccess(res, { conversation });
    } catch (err) {
      next(err);
    }
  };

  const getMessages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const query = req.query as unknown as {
        cursor?: string;
        after?: string;
        limit: number;
      };
      const messages = await service.getMessages(
        String(req.params.id),
        req.user!.id,
        query
      );
      sendSuccess(res, { messages });
    } catch (err) {
      next(err);
    }
  };

  const sendMessage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const conversationId = String(req.params.id);
      const result = await service.sendMessage(
        conversationId,
        req.user!.id,
        req.user!.fullName,
        req.body
      );

      // CHT-6: Emit only after persistence succeeded
      const io = getIo?.();
      if (io && !result.isDuplicate) {
        io.to(`conversation:${conversationId}`).emit("message:new", {
          message: result.message,
        });
        io.to(`user:${result.recipientUserId}`).emit("conversation:updated", {
          conversationId,
        });
        io.to(`user:${req.user!.id}`).emit("conversation:updated", {
          conversationId,
        });
      }

      sendSuccess(res, { message: result.message }, result.isDuplicate ? 200 : 201);
    } catch (err) {
      next(err);
    }
  };

  const markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = String(req.params.id);
      const result = await service.markRead(
        conversationId,
        req.user!.id,
        req.body.upToMessageId
      );

      const io = getIo?.();
      if (io) {
        io.to(`conversation:${conversationId}`).emit("message:read", {
          conversationId,
          upToMessageId: req.body.upToMessageId,
          readAt: result.readAt,
          readByUserId: req.user!.id,
        });
      }

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  return {
    startConversation,
    listConversations,
    getConversation,
    getMessages,
    sendMessage,
    markRead,
  };
}
