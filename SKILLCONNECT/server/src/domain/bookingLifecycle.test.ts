import { describe, expect, it } from "vitest";
import {
  allowedResolutionOutcomes,
  canCustomerConfirm,
  canProviderComplete,
  canReportIssue,
  canReportNoShow,
  countLateCancellations,
  finalNoShowStatus,
  isAllowedResolutionOutcome,
  isLateCancellation,
  noShowDeadline,
  shouldAutoComplete,
} from "./bookingLifecycle.js";

describe("Booking Lifecycle pure domain rules (Phase 7a)", () => {
  it("BKG-5: provider completion allowed only at or after scheduledStart", () => {
    const start = new Date("2026-11-17T10:00:00.000Z");
    expect(
      canProviderComplete("CONFIRMED", start, new Date("2026-11-17T09:59:59.000Z"))
    ).toBe(false);
    expect(canProviderComplete("CONFIRMED", start, start)).toBe(true);
    expect(canProviderComplete("DISPUTED", start, start)).toBe(false);
  });

  it("BKG-6: customer confirm allowed only from PROVIDER_COMPLETED", () => {
    expect(canCustomerConfirm("PROVIDER_COMPLETED")).toBe(true);
    expect(canCustomerConfirm("CONFIRMED")).toBe(false);
    expect(canCustomerConfirm("COMPLETED")).toBe(false);
  });

  it("BKG-7: auto-complete triggers at exactly 48h and skips if disputed", () => {
    const completedAt = new Date("2026-11-15T10:00:00.000Z");
    const justBefore = new Date("2026-11-17T09:59:59.000Z");
    const exact48h = new Date("2026-11-17T10:00:00.000Z");

    expect(
      shouldAutoComplete("PROVIDER_COMPLETED", completedAt, false, justBefore, 48)
    ).toBe(false);
    expect(
      shouldAutoComplete("PROVIDER_COMPLETED", completedAt, false, exact48h, 48)
    ).toBe(true);
    expect(
      shouldAutoComplete("PROVIDER_COMPLETED", completedAt, true, exact48h, 48)
    ).toBe(false);
  });

  it("BKG-8, BKG-9, D1: late-cancel boundary at start - 2h and Asia/Karachi 30-day window count", () => {
    const start = new Date("2026-11-17T10:00:00.000Z");
    expect(
      isLateCancellation(new Date("2026-11-17T07:59:59.000Z"), start, 2)
    ).toBe(false);
    expect(
      isLateCancellation(new Date("2026-11-17T08:00:00.000Z"), start, 2)
    ).toBe(true);
    expect(
      isLateCancellation(new Date("2026-11-17T10:30:00.000Z"), start, 2)
    ).toBe(true);

    // 2026-11-17 18:00 UTC = 23:00 Asia/Karachi
    const now = new Date("2026-11-17T18:00:00.000Z");
    const count = countLateCancellations(
      [
        // Late, within window
        {
          cancelledAt: new Date("2026-11-16T09:00:00.000Z"),
          scheduledStart: new Date("2026-11-16T10:00:00.000Z"),
        },
        // On-time (not late)
        {
          cancelledAt: new Date("2026-11-16T05:00:00.000Z"),
          scheduledStart: new Date("2026-11-16T10:00:00.000Z"),
        },
        // Too old (40 days ago)
        {
          cancelledAt: new Date("2026-10-01T09:00:00.000Z"),
          scheduledStart: new Date("2026-10-01T10:00:00.000Z"),
        },
      ],
      now,
      2,
      30
    );
    expect(count).toBe(1);
  });

  it("BKG-10, BKG-11: no-show grace 60m, deadline +24h, and final status mapping", () => {
    const start = new Date("2026-11-17T10:00:00.000Z");
    expect(
      canReportNoShow("CONFIRMED", start, new Date("2026-11-17T10:59:59.000Z"), 60)
    ).toBe(false);
    expect(
      canReportNoShow("CONFIRMED", start, new Date("2026-11-17T11:00:00.000Z"), 60)
    ).toBe(true);

    const reported = new Date("2026-11-17T11:05:00.000Z");
    expect(noShowDeadline(reported, 24)).toEqual(
      new Date("2026-11-18T11:05:00.000Z")
    );
    expect(finalNoShowStatus("CUSTOMER")).toBe("NO_SHOW_CUSTOMER");
    expect(finalNoShowStatus("PROVIDER")).toBe("NO_SHOW_PROVIDER");
  });

  it("BKG-12, BKG-13: issue only from PROVIDER_COMPLETED and exactly five admin resolution outcomes", () => {
    expect(canReportIssue("PROVIDER_COMPLETED")).toBe(true);
    expect(canReportIssue("COMPLETED")).toBe(false);
    expect(canReportIssue("CONFIRMED")).toBe(false);

    expect(allowedResolutionOutcomes()).toEqual([
      "COMPLETED",
      "CANCELLED_BY_CUSTOMER",
      "CANCELLED_BY_PROVIDER",
      "NO_SHOW_CUSTOMER",
      "NO_SHOW_PROVIDER",
    ]);
    expect(isAllowedResolutionOutcome("COMPLETED")).toBe(true);
    expect(isAllowedResolutionOutcome("CONFIRMED")).toBe(false);
  });
});
