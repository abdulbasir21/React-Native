import type { SendMessageInput } from "@skillconnect/shared";
import {
  canSendInConversation,
  validateClientMessageInput,
} from "../../domain/chat.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";
import { createNotification } from "../notifications/notifications.service.js";
import type { createChatRepository } from "./chat.repository.js";

export function createChatService(
  prisma: PrismaClient,
  repo: ReturnType<typeof createChatRepository>
) {
  const startConversation = async (
    callerUserId: string,
    providerProfileId: string
  ) => {
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      include: { user: { select: { id: true, status: true } } },
    });

    if (
      !provider ||
      provider.status !== "APPROVED" ||
      provider.user.status !== "ACTIVE"
    ) {
      throw new AppError(404, "NOT_FOUND", "Provider not found");
    }

    // CHT-1: Caller cannot chat with their own provider profile
    if (provider.userId === callerUserId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Cannot start a conversation with your own provider profile"
      );
    }

    const conv = await repo.findOrCreateConversation(
      callerUserId,
      provider.id,
      provider.userId
    );
    const list = await repo.listConversationsForUser(callerUserId);
    const dto = list.find((c) => c.id === conv.id);
    if (!dto) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }
    return dto;
  };

  const listConversations = (userId: string) =>
    repo.listConversationsForUser(userId);

  const getConversation = async (conversationId: string, userId: string) => {
    const conv = await repo.findConversationIfParticipant(
      conversationId,
      userId
    );
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }
    const list = await repo.listConversationsForUser(userId);
    const dto = list.find((c) => c.id === conversationId);
    if (!dto) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }
    return dto;
  };

  const getMessages = async (
    conversationId: string,
    userId: string,
    query: { cursor?: string; after?: string; limit: number }
  ) => {
    const conv = await repo.findConversationIfParticipant(
      conversationId,
      userId
    );
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }

    if (query.after) {
      const rows = await repo.getMessagesAfterOldestFirst(
        conversationId,
        query.after,
        query.limit
      );
      if (rows === null) {
        throw new AppError(404, "NOT_FOUND", "Anchor message not found");
      }
      return rows;
    }

    return repo.getMessagesNewestFirst(
      conversationId,
      query.limit,
      query.cursor
    );
  };

  const sendMessage = async (
    conversationId: string,
    senderId: string,
    senderName: string,
    input: SendMessageInput
  ) => {
    const conv = await repo.findConversationIfParticipant(
      conversationId,
      senderId
    );
    // CHT-2: Non-participant gets 404
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }

    // CHT-10: Block sending if either user or provider profile is SUSPENDED
    const allowed = canSendInConversation({
      customerStatus: conv.customerUser.status,
      providerUserStatus: conv.providerProfile.user.status,
      providerProfileStatus: conv.providerProfile.status,
    });
    if (!allowed) {
      throw new AppError(
        403,
        "ACCOUNT_SUSPENDED",
        "Messaging is disabled because a participant or provider is suspended"
      );
    }

    const validationError = validateClientMessageInput(input);
    if (validationError) {
      throw new AppError(422, "VALIDATION_ERROR", validationError);
    }

    const result = await repo.createClientMessage({
      conversationId,
      senderId,
      type: input.type,
      body: input.type === "TEXT" ? input.body!.trim().normalize("NFC") : null,
      imageUrl: input.type === "IMAGE" ? input.imageUrl! : null,
      imageFileId: input.type === "IMAGE" ? input.imageFileId! : null,
      clientMessageId: input.clientMessageId,
    });

    const recipientUserId =
      conv.customerUserId === senderId
        ? conv.providerProfile.userId
        : conv.customerUserId;

    if (!result.isDuplicate) {
      const preview =
        input.type === "IMAGE"
          ? "Photo"
          : (result.message.body ?? "").slice(0, 80);
      await prisma.$transaction(async (tx) => {
        await createNotification(tx, {
          userId: recipientUserId,
          type: "NEW_MESSAGE",
          title: senderName,
          body: preview,
          data: { conversationId, messageId: result.message.id },
        });
      });
    }

    return { ...result, recipientUserId };
  };

  const markDelivered = async (
    conversationId: string,
    recipientId: string,
    messageId: string
  ) => {
    const conv = await repo.findConversationIfParticipant(
      conversationId,
      recipientId
    );
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }
    return repo.markMessageDelivered(
      conversationId,
      recipientId,
      messageId,
      new Date()
    );
  };

  const markRead = async (
    conversationId: string,
    recipientId: string,
    upToMessageId: string
  ) => {
    const conv = await repo.findConversationIfParticipant(
      conversationId,
      recipientId
    );
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }
    const result = await repo.markMessagesReadUpTo(
      conversationId,
      recipientId,
      upToMessageId,
      new Date()
    );
    if (!result) {
      throw new AppError(404, "NOT_FOUND", "Message not found");
    }
    return result;
  };

  return {
    startConversation,
    listConversations,
    getConversation,
    getMessages,
    sendMessage,
    markDelivered,
    markRead,
  };
}
