import type {
  ConversationDto,
  MessageDto,
  MessageType,
} from "@skillconnect/shared";
import { Prisma, type PrismaClient } from "../../generated/prisma/index.js";
import { buildMessagePreview } from "../../domain/chat.js";

function toMessageDto(m: {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  body: string | null;
  imageUrl: string | null;
  imageFileId: string | null;
  offerId: string | null;
  bookingId: string | null;
  clientMessageId: string;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    body: m.body,
    imageUrl: m.imageUrl,
    imageFileId: m.imageFileId,
    offerId: m.offerId,
    bookingId: m.bookingId,
    clientMessageId: m.clientMessageId,
    createdAt: m.createdAt.toISOString(),
    deliveredAt: m.deliveredAt ? m.deliveredAt.toISOString() : null,
    readAt: m.readAt ? m.readAt.toISOString() : null,
  };
}

export function createChatRepository(prisma: PrismaClient) {
  const findConversationIfParticipant = async (
    conversationId: string,
    userId: string
  ) => {
    return prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId } },
      },
      include: {
        customerUser: {
          select: {
            id: true,
            fullName: true,
            status: true,
            customerProfile: { select: { profilePhotoUrl: true } },
          },
        },
        providerProfile: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            photoUrl: true,
            status: true,
            user: { select: { id: true, status: true } },
          },
        },
        participants: true,
      },
    });
  };

  const findOrCreateConversation = async (
    customerUserId: string,
    providerProfileId: string,
    providerUserId: string
  ) => {
    const existing = await prisma.conversation.findUnique({
      where: {
        customerUserId_providerProfileId: {
          customerUserId,
          providerProfileId,
        },
      },
    });
    if (existing) return existing;

    try {
      return await prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.create({
          data: {
            customerUserId,
            providerProfileId,
            participants: {
              create: [
                { userId: customerUserId, roleInConversation: "CUSTOMER" },
                { userId: providerUserId, roleInConversation: "PROVIDER" },
              ],
            },
          },
        });
        return conv;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const retry = await prisma.conversation.findUnique({
          where: {
            customerUserId_providerProfileId: {
              customerUserId,
              providerProfileId,
            },
          },
        });
        if (retry) return retry;
      }
      throw err;
    }
  };

  const listConversationsForUser = async (
    userId: string
  ): Promise<ConversationDto[]> => {
    const convs = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        customerUser: {
          select: {
            id: true,
            fullName: true,
            customerProfile: { select: { profilePhotoUrl: true } },
          },
        },
        providerProfile: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            photoUrl: true,
          },
        },
        participants: true,
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });

    const unreadCounts = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: convs.map((c) => c.id) },
        senderId: { not: userId },
        readAt: null,
      },
      _count: { _all: true },
    });
    const unreadMap = new Map(
      unreadCounts.map((u) => [u.conversationId, u._count._all])
    );

    const items: ConversationDto[] = convs.map((c) => {
      const me = c.participants.find((p) => p.userId === userId)!;
      const latest = c.messages[0] ?? null;
      const isCustomer = me.roleInConversation === "CUSTOMER";

      return {
        id: c.id,
        customerUserId: c.customerUserId,
        providerProfileId: c.providerProfileId,
        myRole: me.roleInConversation,
        otherParty: isCustomer
          ? {
              userId: c.providerProfile.userId,
              displayName: c.providerProfile.displayName,
              photoUrl: c.providerProfile.photoUrl,
            }
          : {
              userId: c.customerUser.id,
              displayName: c.customerUser.fullName,
              photoUrl: c.customerUser.customerProfile?.profilePhotoUrl ?? null,
            },
        latestMessage: latest
          ? {
              id: latest.id,
              type: latest.type,
              preview: buildMessagePreview(latest.type, latest.body),
              createdAt: latest.createdAt.toISOString(),
              senderId: latest.senderId,
            }
          : null,
        unreadCount: unreadMap.get(c.id) ?? 0,
        createdAt: c.createdAt.toISOString(),
      };
    });

    items.sort((a, b) => {
      const timeA = a.latestMessage?.createdAt ?? a.createdAt;
      const timeB = b.latestMessage?.createdAt ?? b.createdAt;
      return timeB.localeCompare(timeA);
    });

    return items;
  };

  const getMessagesNewestFirst = async (
    conversationId: string,
    limit: number,
    cursorId?: string
  ): Promise<MessageDto[]> => {
    let cursorClause: Prisma.MessageWhereInput = {};
    if (cursorId) {
      const target = await prisma.message.findFirst({
        where: { id: cursorId, conversationId },
        select: { id: true, createdAt: true },
      });
      if (target) {
        cursorClause = {
          OR: [
            { createdAt: { lt: target.createdAt } },
            { createdAt: target.createdAt, id: { lt: target.id } },
          ],
        };
      }
    }

    const rows = await prisma.message.findMany({
      where: { conversationId, ...cursorClause },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(toMessageDto);
  };

  const getMessagesAfterOldestFirst = async (
    conversationId: string,
    afterId: string,
    limit: number
  ): Promise<MessageDto[] | null> => {
    const target = await prisma.message.findFirst({
      where: { id: afterId, conversationId },
      select: { id: true, createdAt: true },
    });
    if (!target) return null;

    const rows = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [
          { createdAt: { gt: target.createdAt } },
          { createdAt: target.createdAt, id: { gt: target.id } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toMessageDto);
  };

  const findMessageByClientKey = async (
    conversationId: string,
    senderId: string,
    clientMessageId: string
  ): Promise<MessageDto | null> => {
    const row = await prisma.message.findUnique({
      where: {
        conversationId_senderId_clientMessageId: {
          conversationId,
          senderId,
          clientMessageId,
        },
      },
    });
    return row ? toMessageDto(row) : null;
  };

  const createClientMessage = async (input: {
    conversationId: string;
    senderId: string;
    type: "TEXT" | "IMAGE";
    body: string | null;
    imageUrl: string | null;
    imageFileId: string | null;
    clientMessageId: string;
  }): Promise<{ message: MessageDto; isDuplicate: boolean }> => {
    const existing = await findMessageByClientKey(
      input.conversationId,
      input.senderId,
      input.clientMessageId
    );
    if (existing) {
      return { message: existing, isDuplicate: true };
    }

    try {
      const created = await prisma.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          type: input.type,
          body: input.body,
          imageUrl: input.imageUrl,
          imageFileId: input.imageFileId,
          clientMessageId: input.clientMessageId,
        },
      });
      return { message: toMessageDto(created), isDuplicate: false };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const raceExisting = await findMessageByClientKey(
          input.conversationId,
          input.senderId,
          input.clientMessageId
        );
        if (raceExisting) {
          return { message: raceExisting, isDuplicate: true };
        }
      }
      throw err;
    }
  };

  const markMessageDelivered = async (
    conversationId: string,
    recipientId: string,
    messageId: string,
    now: Date
  ): Promise<MessageDto | null> => {
    const target = await prisma.message.findFirst({
      where: { id: messageId, conversationId, senderId: { not: recipientId } },
    });
    if (!target) return null;

    const updated = await prisma.message.update({
      where: { id: target.id },
      data: { deliveredAt: target.deliveredAt ?? now },
    });
    return toMessageDto(updated);
  };

  const markMessagesReadUpTo = async (
    conversationId: string,
    recipientId: string,
    upToMessageId: string,
    now: Date
  ): Promise<{ updatedCount: number; readAt: string } | null> => {
    const target = await prisma.message.findFirst({
      where: { id: upToMessageId, conversationId },
      select: { id: true, createdAt: true },
    });
    if (!target) return null;

    // CHT-7: Set readAt on target and all earlier messages from the other participant.
    // Ensure deliveredAt is set if null so readAt is never earlier than deliveredAt, and never clear existing timestamps.
    const result = await prisma.$executeRaw`
      UPDATE messages
      SET
        delivered_at = COALESCE(delivered_at, ${now}),
        read_at = COALESCE(read_at, ${now})
      WHERE conversation_id = ${conversationId}::uuid
        AND sender_id <> ${recipientId}::uuid
        AND read_at IS NULL
        AND (
          created_at < ${target.createdAt}
          OR (created_at = ${target.createdAt} AND id <= ${target.id}::uuid)
        )
    `;

    return {
      updatedCount: Number(result),
      readAt: now.toISOString(),
    };
  };

  return {
    findConversationIfParticipant,
    findOrCreateConversation,
    listConversationsForUser,
    getMessagesNewestFirst,
    getMessagesAfterOldestFirst,
    createClientMessage,
    markMessageDelivered,
    markMessagesReadUpTo,
    toMessageDto,
  };
}
