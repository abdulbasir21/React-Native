import type { Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { sendMessageSchema } from "@skillconnect/shared";
import type { AppConfig } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/index.js";
import type { createChatRepository } from "../modules/chat/chat.repository.js";
import type { createChatService } from "../modules/chat/chat.service.js";

export interface SocketUser {
  id: string;
  fullName: string;
}

export function attachChatSocketServer(
  httpServer: HttpServer,
  deps: {
    config: AppConfig;
    prisma: PrismaClient;
    chatRepo: ReturnType<typeof createChatRepository>;
    chatService: ReturnType<typeof createChatService>;
  }
): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: deps.config.CORS_ORIGINS,
      credentials: true,
    },
  });

  // CHT-11: Handshake JWT authentication + DB status check
  io.use(async (socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;
      const headerAuth = socket.handshake.headers.authorization;
      const token =
        typeof authToken === "string" && authToken.trim()
          ? authToken.trim()
          : typeof headerAuth === "string" && headerAuth.startsWith("Bearer ")
            ? headerAuth.slice(7).trim()
            : null;

      if (!token) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }

      const payload = jwt.verify(token, deps.config.JWT_ACCESS_SECRET) as {
        sub?: string;
      };
      if (!payload.sub) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }

      const user = await deps.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, fullName: true, status: true },
      });
      if (!user || user.status === "SUSPENDED") {
        next(new Error("UNAUTHENTICATED"));
        return;
      }

      socket.data.user = { id: user.id, fullName: user.fullName } satisfies SocketUser;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser;
    void socket.join(`user:${user.id}`);

    socket.on(
      "conversation:join",
      async (
        payload: { conversationId?: string },
        ack?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const conversationId = payload?.conversationId;
          if (!conversationId) {
            ack?.({ ok: false, error: "NOT_FOUND" });
            return;
          }
          const conv = await deps.chatRepo.findConversationIfParticipant(
            conversationId,
            user.id
          );
          if (!conv) {
            ack?.({ ok: false, error: "NOT_FOUND" });
            return;
          }
          await socket.join(`conversation:${conversationId}`);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: "NOT_FOUND" });
        }
      }
    );

    socket.on(
      "message:send",
      async (
        payload: { conversationId?: string } & Record<string, unknown>,
        ack?: (res: { ok: boolean; message?: unknown; error?: string }) => void
      ) => {
        try {
          const conversationId = payload?.conversationId;
          if (!conversationId) {
            ack?.({ ok: false, error: "VALIDATION_ERROR" });
            return;
          }
          const msgBody = { ...payload };
          delete msgBody.conversationId;
          const parsed = sendMessageSchema.parse(msgBody);

          // CHT-6: Persist in PostgreSQL before any socket emit
          const result = await deps.chatService.sendMessage(
            conversationId,
            user.id,
            user.fullName,
            parsed
          );

          if (!result.isDuplicate) {
            io.to(`conversation:${conversationId}`).emit("message:new", {
              message: result.message,
            });
            io.to(`user:${result.recipientUserId}`).emit("conversation:updated", {
              conversationId,
            });
            io.to(`user:${user.id}`).emit("conversation:updated", {
              conversationId,
            });
          }

          ack?.({ ok: true, message: result.message });
        } catch (err) {
          ack?.({
            ok: false,
            error: err instanceof Error ? err.message : "SEND_FAILED",
          });
        }
      }
    );

    socket.on(
      "message:delivered",
      async (payload: { conversationId?: string; messageId?: string }) => {
        try {
          if (!payload?.conversationId || !payload?.messageId) return;
          const updated = await deps.chatService.markDelivered(
            payload.conversationId,
            user.id,
            payload.messageId
          );
          if (updated) {
            io.to(`conversation:${payload.conversationId}`).emit(
              "message:delivered",
              { messageId: updated.id, deliveredAt: updated.deliveredAt }
            );
          }
        } catch {
          // ignore
        }
      }
    );

    socket.on(
      "message:read",
      async (payload: { conversationId?: string; upToMessageId?: string }) => {
        try {
          if (!payload?.conversationId || !payload?.upToMessageId) return;
          const res = await deps.chatService.markRead(
            payload.conversationId,
            user.id,
            payload.upToMessageId
          );
          io.to(`conversation:${payload.conversationId}`).emit("message:read", {
            conversationId: payload.conversationId,
            upToMessageId: payload.upToMessageId,
            readAt: res.readAt,
            readByUserId: user.id,
          });
        } catch {
          // ignore
        }
      }
    );
  });

  return io;
}
