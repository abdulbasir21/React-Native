import { z } from "zod";
import {
  FINAL_BOOKING_STATUSES,
  type BookingStatus,
  type FinalBookingStatus,
} from "./offersAndBookings.js";

export const DISPUTE_TYPES = ["ISSUE", "NO_SHOW"] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const DISPUTE_STATUSES = [
  "OPEN",
  "AWAITING_RESPONSE",
  "IN_REVIEW",
  "RESOLVED",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

const normalizeText = (val: string) => val.trim().normalize("NFC");

export const cancelBookingSchema = z
  .object({
    reason: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(5).max(300)),
  })
  .strict();

export const reportNoShowSchema = z
  .object({
    reason: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(5).max(500)),
  })
  .strict();

export const respondNoShowSchema = z
  .object({
    action: z.enum(["accept", "dispute"]),
    response: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().max(1000))
      .optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      val.action === "dispute" &&
      (!val.response || val.response.trim().length < 10)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response"],
        message: "Dispute response must be at least 10 characters",
      });
    }
  });

export const reportIssueSchema = z
  .object({
    reason: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(10).max(1000)),
  })
  .strict();

export const resolveDisputeSchema = z
  .object({
    outcome: z.enum(FINAL_BOOKING_STATUSES),
    resolutionNote: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(10).max(1000)),
  })
  .strict();

export const adminDisputesQuerySchema = z.object({
  status: z.enum(DISPUTE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface DisputeDto {
  id: string;
  bookingId: string;
  type: DisputeType;
  openedByUserId: string;
  accusedUserId: string | null;
  reason: string;
  response: string | null;
  respondedAt: string | null;
  responseDeadline: string | null;
  status: DisputeStatus;
  outcome: FinalBookingStatus | null;
  resolutionNote: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  booking?: {
    id: string;
    serviceName: string;
    pricePkr: string;
    scheduledStart: string;
    status: BookingStatus;
    serviceAddress?: string;
    customerFullName: string;
    providerDisplayName: string;
  };
}
