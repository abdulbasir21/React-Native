import {
  FINAL_BOOKING_STATUSES,
  type BookingStatus,
  type FinalBookingStatus,
  type OfferStatus,
} from "@skillconnect/shared";

export interface OfferValidationConstants {
  offerMinLeadMinutes: number;
  offerMaxDaysAhead: number;
  offerMaxPricePkr: number;
}

/**
 * OFR-3: expiresAt = min(createdAt + expiryHours, proposedStart)
 */
export function computeOfferExpiry(
  createdAt: Date,
  proposedStart: Date,
  expiryHours: number
): Date {
  const plusHours = new Date(
    createdAt.getTime() + expiryHours * 60 * 60 * 1000
  );
  return plusHours.getTime() <= proposedStart.getTime()
    ? plusHours
    : new Date(proposedStart.getTime());
}

/**
 * OFR-2, D3, D5, D10: Validates offer price (whole PKR) and proposedStart against server clock.
 */
export function validateOfferInput(
  input: {
    serviceName: string;
    description: string;
    pricePkr: number;
    proposedStart: Date;
    terms?: string;
  },
  nowUtc: Date,
  constants: OfferValidationConstants
): string[] {
  const errors: string[] = [];
  const name = input.serviceName.trim();
  if (name.length < 2 || name.length > 100) {
    errors.push("serviceName must be 2-100 characters");
  }
  const desc = input.description.trim();
  if (desc.length < 10 || desc.length > 1000) {
    errors.push("description must be 10-1000 characters");
  }
  if (
    !Number.isInteger(input.pricePkr) ||
    input.pricePkr < 1 ||
    input.pricePkr > constants.offerMaxPricePkr
  ) {
    errors.push(
      `pricePkr must be a whole integer between 1 and ${constants.offerMaxPricePkr}`
    );
  }
  const minStartMs =
    nowUtc.getTime() + constants.offerMinLeadMinutes * 60 * 1000;
  const maxStartMs =
    nowUtc.getTime() + constants.offerMaxDaysAhead * 24 * 60 * 60 * 1000;

  if (input.proposedStart.getTime() < minStartMs) {
    errors.push(
      `proposedStart must be at least ${constants.offerMinLeadMinutes} minutes in the future`
    );
  }
  if (input.proposedStart.getTime() > maxStartMs) {
    errors.push(
      `proposedStart cannot be more than ${constants.offerMaxDaysAhead} days ahead`
    );
  }
  if (input.terms && input.terms.trim().length > 1000) {
    errors.push("terms must be at most 1000 characters");
  }
  return errors;
}

/**
 * OFR-7: Server clock check for offer expiry.
 */
export function isOfferExpired(expiresAt: Date, nowUtc: Date): boolean {
  return nowUtc.getTime() >= expiresAt.getTime();
}

/**
 * OFR-6: Offer state machine. Only PENDING offers can transition.
 */
export function canTransitionOffer(
  from: OfferStatus,
  to: OfferStatus,
  actor: "CUSTOMER" | "PROVIDER" | "SYSTEM"
): boolean {
  if (from !== "PENDING") return false;
  if (actor === "CUSTOMER") return to === "ACCEPTED" || to === "DECLINED";
  if (actor === "PROVIDER") return to === "WITHDRAWN";
  if (actor === "SYSTEM") return to === "EXPIRED" || to === "SUPERSEDED";
  return false;
}

/**
 * BKG-15: Final booking states never transition out.
 */
export function isFinalBookingStatus(
  status: BookingStatus
): status is FinalBookingStatus {
  return (FINAL_BOOKING_STATUSES as readonly string[]).includes(status);
}

export type BookingTransitionActor =
  | "CUSTOMER"
  | "PROVIDER"
  | "ADMIN"
  | "SYSTEM";

/**
 * BKG-4: Exact booking transition table from MASTER_PROMPT.md section 6.
 */
export function canTransitionBooking(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingTransitionActor
): boolean {
  if (isFinalBookingStatus(from)) return false;

  switch (from) {
    case "CONFIRMED":
      if (to === "PROVIDER_COMPLETED") return actor === "PROVIDER";
      if (to === "CANCELLED_BY_CUSTOMER") return actor === "CUSTOMER";
      if (to === "CANCELLED_BY_PROVIDER") return actor === "PROVIDER";
      if (to === "NO_SHOW_REPORTED") {
        return actor === "CUSTOMER" || actor === "PROVIDER";
      }
      return false;

    case "NO_SHOW_REPORTED":
      if (to === "NO_SHOW_CUSTOMER" || to === "NO_SHOW_PROVIDER") {
        return actor === "CUSTOMER" || actor === "PROVIDER" || actor === "SYSTEM";
      }
      if (to === "DISPUTED") {
        return actor === "CUSTOMER" || actor === "PROVIDER";
      }
      return false;

    case "PROVIDER_COMPLETED":
      if (to === "COMPLETED") return actor === "CUSTOMER" || actor === "SYSTEM";
      if (to === "DISPUTED") return actor === "CUSTOMER";
      return false;

    case "DISPUTED":
      return actor === "ADMIN" && isFinalBookingStatus(to);
  }
}
