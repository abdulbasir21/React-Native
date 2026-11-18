import { describe, expect, it } from "vitest";
import {
  buildMessagePreview,
  canSendInConversation,
  computeReceiptTimestamps,
  validateClientMessageInput,
} from "./chat.js";

describe("Chat pure domain rules", () => {
  it("CHT-3, CHT-4: allows only TEXT (1..2000 trimmed) and IMAGE, rejects OFFER/BOOKING from clients", () => {
    expect(validateClientMessageInput({ type: "OFFER", body: "Offer" })).not.toBeNull();
    expect(validateClientMessageInput({ type: "BOOKING", body: "Booking" })).not.toBeNull();
    expect(validateClientMessageInput({ type: "TEXT", body: "   " })).not.toBeNull();
    expect(
      validateClientMessageInput({ type: "TEXT", body: "a".repeat(2001) })
    ).not.toBeNull();
    expect(
      validateClientMessageInput({ type: "TEXT", body: "  Hello worker  " })
    ).toBeNull();
    expect(
      validateClientMessageInput({
        type: "IMAGE",
        imageUrl: "https://ik.imagekit.io/test/a.jpg",
        imageFileId: "f1",
      })
    ).toBeNull();
  });

  it("CHT-7: ensures readAt is never earlier than deliveredAt and never cleared", () => {
    const t1 = new Date("2026-11-16T10:00:00.000Z");
    const t2 = new Date("2026-11-16T10:05:00.000Z");

    // Read before delivered sets both deliveredAt and readAt
    const r1 = computeReceiptTimestamps(
      { deliveredAt: null, readAt: null },
      "READ",
      t1
    );
    expect(r1.deliveredAt).toEqual(t1);
    expect(r1.readAt).toEqual(t1);

    // Subsequent DELIVERED does not overwrite or clear readAt
    const r2 = computeReceiptTimestamps(r1, "DELIVERED", t2);
    expect(r2.deliveredAt).toEqual(t1);
    expect(r2.readAt).toEqual(t1);
  });

  it("CHT-10: blocks sending when customer, provider user, or provider profile is SUSPENDED", () => {
    expect(
      canSendInConversation({
        customerStatus: "ACTIVE",
        providerUserStatus: "ACTIVE",
        providerProfileStatus: "APPROVED",
      })
    ).toBe(true);

    expect(
      canSendInConversation({
        customerStatus: "SUSPENDED",
        providerUserStatus: "ACTIVE",
        providerProfileStatus: "APPROVED",
      })
    ).toBe(false);

    expect(
      canSendInConversation({
        customerStatus: "ACTIVE",
        providerUserStatus: "ACTIVE",
        providerProfileStatus: "SUSPENDED",
      })
    ).toBe(false);
  });

  it("CHT-9: generates previews for IMAGE and TEXT", () => {
    expect(buildMessagePreview("IMAGE", null)).toBe("Photo");
    expect(buildMessagePreview("TEXT", "Hello")).toBe("Hello");
  });
});
