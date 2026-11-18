import { z } from "zod";

export const MESSAGE_TYPES = ["TEXT", "IMAGE", "OFFER", "BOOKING"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const CLIENT_MESSAGE_TYPES = ["TEXT", "IMAGE"] as const;
export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

export const CONVERSATION_ROLES = ["CUSTOMER", "PROVIDER"] as const;
export type ConversationRole = (typeof CONVERSATION_ROLES)[number];

const normalizeText = (val: string) => val.trim().normalize("NFC");

export const startConversationSchema = z
  .object({
    providerProfileId: z.string().uuid(),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    type: z.enum(CLIENT_MESSAGE_TYPES),
    body: z.string().transform(normalizeText).optional(),
    imageUrl: z.string().url().max(500).optional(),
    imageFileId: z.string().min(1).max(200).optional(),
    clientMessageId: z.string().trim().min(8).max(100),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.type === "TEXT") {
      if (!val.body || val.body.length < 1 || val.body.length > 2000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["body"],
          message: "Message text must be between 1 and 2000 characters",
        });
      }
    }
    if (val.type === "IMAGE") {
      if (!val.imageUrl || !val.imageFileId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["imageUrl"],
          message: "Image URL and fileId are required for IMAGE messages",
        });
      }
    }
  });

export const messagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const markReadSchema = z
  .object({
    upToMessageId: z.string().uuid(),
  })
  .strict();

export interface MessageDto {
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
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface ConversationDto {
  id: string;
  customerUserId: string;
  providerProfileId: string;
  myRole: ConversationRole;
  otherParty: {
    userId: string;
    displayName: string;
    photoUrl: string | null;
  };
  latestMessage: {
    id: string;
    type: MessageType;
    preview: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
  createdAt: string;
}

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
