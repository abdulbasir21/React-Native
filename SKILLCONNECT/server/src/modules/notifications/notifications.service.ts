import type {
  NotificationDto,
  RegisterPushTokenInput,
} from "@skillconnect/shared";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { Prisma, PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";

const expoClient = new Expo();

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

export type PushSender = (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;

/**
 * NTF-2: Push text for chat messages never includes addresses/coordinates;
 * truncates text to 80 chars and uses "Photo" for images.
 */
export function sanitizePushMessagePreview(
  messageType: "TEXT" | "IMAGE",
  body: string | null | undefined
): string {
  if (messageType === "IMAGE") return "Photo";
  const clean = (body ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= 80) return clean || "New message";
  return `${clean.slice(0, 77)}...`;
}

/**
 * Persists a Notification row inside the caller's database transaction.
 */
export async function createNotification(
  tx: Prisma.TransactionClient,
  input: CreateNotificationInput
) {
  return tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.data !== undefined ? { data: input.data } : {}),
    },
  });
}

/**
 * NTF-3, NTF-4:
 * Post-commit push dispatcher. Never throws or fails the request.
 * Deletes DeviceNotRegistered tokens automatically.
 */
export async function dispatchPushNotifications(
  prisma: PrismaClient,
  input: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
  customSender?: PushSender
): Promise<{ sent: number; removedTokens: number }> {
  let sent = 0;
  let removedTokens = 0;

  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: input.userId },
      select: { id: true, expoPushToken: true },
    });
    if (tokens.length === 0) {
      return { sent: 0, removedTokens: 0 };
    }

    const validTokens = tokens.filter((t) =>
      Expo.isExpoPushToken(t.expoPushToken)
    );
    if (validTokens.length === 0) {
      return { sent: 0, removedTokens: 0 };
    }

    const messages: ExpoPushMessage[] = validTokens.map((t) => ({
      to: t.expoPushToken,
      sound: "default",
      title: input.title,
      body: input.body,
      ...(input.data ? { data: input.data } : {}),
    }));

    const sender: PushSender =
      customSender ??
      (async (chunk) => expoClient.sendPushNotificationsAsync(chunk));

    const chunks = expoClient.chunkPushNotifications(messages);
    const tokensToDelete: string[] = [];

    let offset = 0;
    for (const chunk of chunks) {
      const tickets = await sender(chunk);
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const tokenObj = validTokens[offset + i];
        if (!ticket || !tokenObj) continue;

        if (ticket.status === "ok") {
          sent += 1;
        } else if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          tokensToDelete.push(tokenObj.expoPushToken);
        }
      }
      offset += chunk.length;
    }

    if (tokensToDelete.length > 0) {
      const del = await prisma.pushToken.deleteMany({
        where: { expoPushToken: { in: tokensToDelete } },
      });
      removedTokens = del.count;
    }
  } catch {
    // NTF-3: Push failure must never break the request
  }

  return { sent, removedTokens };
}

function toNotificationDto(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : null,
    isRead: row.readAt !== null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createNotificationsService(prisma: PrismaClient) {
  const listMyNotifications = async (
    userId: string,
    limit = 30,
    offset = 0
  ): Promise<{ notifications: NotificationDto[]; unreadCount: number }> => {
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      notifications: rows.map(toNotificationDto),
      unreadCount,
    };
  };

  const markRead = async (
    userId: string,
    notificationId: string
  ): Promise<NotificationDto> => {
    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existing || existing.userId !== userId) {
      throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
    }

    const updated = existing.readAt !== null
      ? existing
      : await prisma.notification.update({
          where: { id: notificationId },
          data: { readAt: new Date() },
        });

    return toNotificationDto(updated);
  };

  const markAllRead = async (userId: string): Promise<{ updatedCount: number }> => {
    const res = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: res.count };
  };

  const registerPushToken = async (
    userId: string,
    input: RegisterPushTokenInput
  ) => {
    return prisma.pushToken.upsert({
      where: { expoPushToken: input.expoPushToken },
      create: {
        userId,
        expoPushToken: input.expoPushToken,
        platform: input.platform,
      },
      update: {
        userId,
        platform: input.platform,
      },
    });
  };

  const deletePushToken = async (userId: string, expoPushToken: string) => {
    await prisma.pushToken.deleteMany({
      where: { userId, expoPushToken },
    });
  };

  return {
    listMyNotifications,
    markRead,
    markAllRead,
    registerPushToken,
    deletePushToken,
  };
}
