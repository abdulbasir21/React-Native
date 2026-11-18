import {
  FINAL_BOOKING_STATUSES,
  type BookingStatus,
  type FinalBookingStatus,
} from "@skillconnect/shared";

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * BKG-5: Provider can mark completed only when CONFIRMED and server now >= scheduledStart.
 */
export function canProviderComplete(
  status: BookingStatus,
  scheduledStart: Date,
  nowUtc: Date
): boolean {
  return (
    status === "CONFIRMED" && nowUtc.getTime() >= scheduledStart.getTime()
  );
}

/**
 * BKG-6: Customer confirms completion only from PROVIDER_COMPLETED.
 */
export function canCustomerConfirm(status: BookingStatus): boolean {
  return status === "PROVIDER_COMPLETED";
}

/**
 * BKG-7: Auto-complete at or after AUTO_COMPLETE_HOURS since providerCompletedAt with no active dispute.
 */
export function shouldAutoComplete(
  status: BookingStatus,
  providerCompletedAt: Date | null,
  hasActiveDispute: boolean,
  nowUtc: Date,
  autoCompleteHours: number
): boolean {
  if (status !== "PROVIDER_COMPLETED" || hasActiveDispute || !providerCompletedAt) {
    return false;
  }
  const thresholdMs =
    providerCompletedAt.getTime() + autoCompleteHours * 60 * 60 * 1000;
  return nowUtc.getTime() >= thresholdMs;
}

/**
 * BKG-8: Cancellation is late if cancelledAt >= scheduledStart - LATE_CANCEL_HOURS.
 */
export function isLateCancellation(
  cancelledAt: Date,
  scheduledStart: Date,
  lateCancelHours: number
): boolean {
  const cutoffMs =
    scheduledStart.getTime() - lateCancelHours * 60 * 60 * 1000;
  return cancelledAt.getTime() >= cutoffMs;
}

/**
 * Returns the UTC start of the Asia/Karachi calendar day containing `dateUtc`.
 */
export function karachiStartOfDayUtc(dateUtc: Date): Date {
  const shifted = new Date(dateUtc.getTime() + KARACHI_OFFSET_MS);
  const startShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0,
    0,
    0,
    0
  );
  return new Date(startShifted - KARACHI_OFFSET_MS);
}

/**
 * BKG-9, D1: Counts late cancellations within the last `windowDays` Asia/Karachi calendar days.
 */
export function countLateCancellations(
  cancellations: { cancelledAt: Date; scheduledStart: Date }[],
  nowUtc: Date,
  lateCancelHours: number,
  windowDays: number
): number {
  const todayStartUtc = karachiStartOfDayUtc(nowUtc);
  const windowStartMs =
    todayStartUtc.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000;

  return cancellations.filter(
    (c) =>
      c.cancelledAt.getTime() >= windowStartMs &&
      c.cancelledAt.getTime() <= nowUtc.getTime() &&
      isLateCancellation(c.cancelledAt, c.scheduledStart, lateCancelHours)
  ).length;
}

/**
 * BKG-10: No-show can be reported only when CONFIRMED and now >= scheduledStart + graceMinutes.
 */
export function canReportNoShow(
  status: BookingStatus,
  scheduledStart: Date,
  nowUtc: Date,
  graceMinutes: number
): boolean {
  if (status !== "CONFIRMED") return false;
  const eligibleMs = scheduledStart.getTime() + graceMinutes * 60 * 1000;
  return nowUtc.getTime() >= eligibleMs;
}

/**
 * BKG-10, BKG-11: Computes no-show response deadline.
 */
export function noShowDeadline(reportedAt: Date, responseHours: number): Date {
  return new Date(reportedAt.getTime() + responseHours * 60 * 60 * 1000);
}

/**
 * BKG-11: Maps accused party role to final NO_SHOW_* booking status.
 */
export function finalNoShowStatus(
  accusedRole: "CUSTOMER" | "PROVIDER"
): "NO_SHOW_CUSTOMER" | "NO_SHOW_PROVIDER" {
  return accusedRole === "CUSTOMER" ? "NO_SHOW_CUSTOMER" : "NO_SHOW_PROVIDER";
}

/**
 * BKG-12: Customer can report an issue only from PROVIDER_COMPLETED.
 */
export function canReportIssue(status: BookingStatus): boolean {
  return status === "PROVIDER_COMPLETED";
}

/**
 * BKG-13: Returns the five allowed final resolution outcomes for admin dispute resolution.
 */
export function allowedResolutionOutcomes(): readonly FinalBookingStatus[] {
  return FINAL_BOOKING_STATUSES;
}

export function isAllowedResolutionOutcome(
  outcome: string
): outcome is FinalBookingStatus {
  return (FINAL_BOOKING_STATUSES as readonly string[]).includes(outcome);
}
