import { z } from "zod";

export const registerPushTokenSchema = z
  .object({
    expoPushToken: z.string().trim().min(10).max(255),
    platform: z.enum(["android", "ios"]),
  })
  .strict();

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const deletePushTokenSchema = z
  .object({
    expoPushToken: z.string().trim().min(10).max(255),
  })
  .strict();

export type DeletePushTokenInput = z.infer<typeof deletePushTokenSchema>;

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
