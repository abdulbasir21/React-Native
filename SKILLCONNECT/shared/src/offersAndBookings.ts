import { z } from "zod";

export const OFFER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
  "SUPERSEDED",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const BOOKING_STATUSES = [
  "CONFIRMED",
  "PROVIDER_COMPLETED",
  "COMPLETED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_PROVIDER",
  "NO_SHOW_REPORTED",
  "NO_SHOW_CUSTOMER",
  "NO_SHOW_PROVIDER",
  "DISPUTED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const FINAL_BOOKING_STATUSES = [
  "COMPLETED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_PROVIDER",
  "NO_SHOW_CUSTOMER",
  "NO_SHOW_PROVIDER",
] as const;
export type FinalBookingStatus = (typeof FINAL_BOOKING_STATUSES)[number];

export const ACTOR_TYPES = ["USER", "ADMIN", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

const normalizeText = (val: string) => val.trim().normalize("NFC");

export const createOfferSchema = z
  .object({
    serviceName: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(2).max(100)),
    description: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(10).max(1000)),
    pricePkr: z.number().int("Price must be whole PKR rupees").min(1),
    proposedStart: z.string().datetime({ offset: true }),
    terms: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().max(1000))
      .optional(),
  })
  .strict();

export const acceptOfferSchema = z
  .object({
    serviceAddress: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(3).max(300)),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict();

export interface ServiceOfferDto {
  id: string;
  conversationId: string;
  providerProfileId: string;
  customerUserId: string;
  serviceName: string;
  description: string;
  pricePkr: string;
  proposedStart: string;
  terms: string | null;
  status: OfferStatus;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface BookingStatusHistoryDto {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorType: ActorType;
  actorUserId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface BookingDto {
  id: string;
  offerId: string;
  conversationId: string;
  customerUserId: string;
  providerProfileId: string;
  providerDisplayName: string;
  customerFullName: string;
  serviceName: string;
  description: string;
  pricePkr: string;
  scheduledStart: string;
  serviceAddress?: string;
  status: BookingStatus;
  providerCompletedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  isLateCancellation?: boolean;
  createdAt: string;
  history?: BookingStatusHistoryDto[];
}

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type AcceptOfferInput = z.infer<typeof acceptOfferSchema>;
