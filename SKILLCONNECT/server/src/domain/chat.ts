import type {
  MessageType,
  ProviderStatus,
  UserStatus,
} from "@skillconnect/shared";

/**
 * CHT-3, CHT-4: Validates a client message payload. Clients may send TEXT or IMAGE only.
 */
export function validateClientMessageInput(input: {
  type: string;
  body?: string;
  imageUrl?: string;
  imageFileId?: string;
}): string | null {
  if (input.type !== "TEXT" && input.type !== "IMAGE") {
    return "Clients can only send TEXT or IMAGE messages";
  }
  if (input.type === "TEXT") {
    const trimmed = input.body?.trim().normalize("NFC") ?? "";
    if (trimmed.length < 1 || trimmed.length > 2000) {
      return "Message text must be between 1 and 2000 characters";
    }
  }
  if (input.type === "IMAGE") {
    if (!input.imageUrl || !input.imageFileId) {
      return "IMAGE message requires imageUrl and imageFileId";
    }
  }
  return null;
}

/**
 * CHT-10: Sending is blocked if either user is SUSPENDED or the provider profile is SUSPENDED.
 */
export function canSendInConversation(params: {
  customerStatus: UserStatus;
  providerUserStatus: UserStatus;
  providerProfileStatus: ProviderStatus;
}): boolean {
  if (params.customerStatus === "SUSPENDED") return false;
  if (params.providerUserStatus === "SUSPENDED") return false;
  if (params.providerProfileStatus === "SUSPENDED") return false;
  return true;
}

/**
 * CHT-7: Computes next deliveredAt / readAt timestamps.
 * readAt is never earlier than deliveredAt and neither timestamp is ever cleared.
 */
export function computeReceiptTimestamps(
  current: { deliveredAt: Date | null; readAt: Date | null },
  event: "DELIVERED" | "READ",
  now: Date
): { deliveredAt: Date; readAt: Date | null } {
  const deliveredAt = current.deliveredAt ?? now;
  if (event === "DELIVERED") {
    return { deliveredAt, readAt: current.readAt };
  }
  const candidateRead = current.readAt ?? now;
  const readAt =
    candidateRead.getTime() < deliveredAt.getTime()
      ? deliveredAt
      : candidateRead;
  return { deliveredAt, readAt };
}

/**
 * CHT-9: Builds a safe conversation preview string at query time.
 */
export function buildMessagePreview(
  type: MessageType,
  body: string | null
): string {
  if (type === "IMAGE") return "Photo";
  if (type === "OFFER") return body ? `Offer: ${body.slice(0, 60)}` : "Service offer";
  if (type === "BOOKING") return body ? `Booking: ${body.slice(0, 60)}` : "Booking update";
  return (body ?? "").slice(0, 80);
}
