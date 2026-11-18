import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  OFFER_STATUSES,
} from "@skillconnect/shared";
import {
  canTransitionBooking,
  canTransitionOffer,
  computeOfferExpiry,
  isFinalBookingStatus,
  isOfferExpired,
  validateOfferInput,
} from "./offersAndBookings.js";

const CONSTANTS = {
  offerMinLeadMinutes: 30,
  offerMaxDaysAhead: 90,
  offerMaxPricePkr: 10_000_000,
};

describe("Offers & Bookings pure domain rules (Phase 6a)", () => {
  it("OFR-2, D3, D5, D10: validates whole PKR price, lead time, and 90-day cap using injected constants", () => {
    const now = new Date("2026-11-17T05:00:00.000Z");

    // Valid offer
    expect(
      validateOfferInput(
        {
          serviceName: "Solar Inverter Setup",
          description: "Install and test 5kW hybrid inverter.",
          pricePkr: 5000,
          proposedStart: new Date("2026-11-17T06:00:00.000Z"),
        },
        now,
        CONSTANTS
      )
    ).toEqual([]);

    // Fractional PKR rejected (D3)
    expect(
      validateOfferInput(
        {
          serviceName: "Solar Inverter Setup",
          description: "Install and test 5kW hybrid inverter.",
          pricePkr: 5000.5,
          proposedStart: new Date("2026-11-17T06:00:00.000Z"),
        },
        now,
        CONSTANTS
      ).length
    ).toBeGreaterThan(0);

    // Lead time < 30 min rejected
    expect(
      validateOfferInput(
        {
          serviceName: "Solar Inverter Setup",
          description: "Install and test 5kW hybrid inverter.",
          pricePkr: 5000,
          proposedStart: new Date("2026-11-17T05:20:00.000Z"),
        },
        now,
        CONSTANTS
      ).length
    ).toBeGreaterThan(0);

    // > 90 days ahead rejected
    expect(
      validateOfferInput(
        {
          serviceName: "Solar Inverter Setup",
          description: "Install and test 5kW hybrid inverter.",
          pricePkr: 5000,
          proposedStart: new Date("2027-03-01T05:00:00.000Z"),
        },
        now,
        CONSTANTS
      ).length
    ).toBeGreaterThan(0);
  });

  it("OFR-3, OFR-7: computes min(created + 24h, proposedStart) and checks expiry at server clock", () => {
    const created = new Date("2026-11-17T05:00:00.000Z");

    // Proposed start in 1 hour -> expires in 1 hour
    const soonStart = new Date("2026-11-17T06:00:00.000Z");
    const expSoon = computeOfferExpiry(created, soonStart, 24);
    expect(expSoon).toEqual(soonStart);
    expect(isOfferExpired(expSoon, new Date("2026-11-17T05:59:59.000Z"))).toBe(
      false
    );
    expect(isOfferExpired(expSoon, soonStart)).toBe(true);

    // Proposed start in 48 hours -> expires at created + 24h
    const laterStart = new Date("2026-11-19T05:00:00.000Z");
    const expLater = computeOfferExpiry(created, laterStart, 24);
    expect(expLater).toEqual(new Date("2026-11-18T05:00:00.000Z"));
  });

  it("OFR-5, OFR-6: enforces offer transitions and keeps terminal states final", () => {
    expect(canTransitionOffer("PENDING", "ACCEPTED", "CUSTOMER")).toBe(true);
    expect(canTransitionOffer("PENDING", "DECLINED", "CUSTOMER")).toBe(true);
    expect(canTransitionOffer("PENDING", "WITHDRAWN", "PROVIDER")).toBe(true);
    expect(canTransitionOffer("PENDING", "ACCEPTED", "PROVIDER")).toBe(false);
    expect(canTransitionOffer("PENDING", "WITHDRAWN", "CUSTOMER")).toBe(false);

    for (const s of OFFER_STATUSES) {
      if (s === "PENDING") continue;
      expect(canTransitionOffer(s, "ACCEPTED", "CUSTOMER")).toBe(false);
      expect(canTransitionOffer(s, "WITHDRAWN", "PROVIDER")).toBe(false);
    }
  });

  it("BKG-4, BKG-15: enforces exact booking transition table and final states have no exits", () => {
    expect(
      canTransitionBooking("CONFIRMED", "PROVIDER_COMPLETED", "PROVIDER")
    ).toBe(true);
    expect(
      canTransitionBooking("CONFIRMED", "PROVIDER_COMPLETED", "CUSTOMER")
    ).toBe(false);
    expect(
      canTransitionBooking("CONFIRMED", "CANCELLED_BY_CUSTOMER", "CUSTOMER")
    ).toBe(true);
    expect(
      canTransitionBooking("CONFIRMED", "CANCELLED_BY_PROVIDER", "PROVIDER")
    ).toBe(true);
    expect(
      canTransitionBooking("CONFIRMED", "NO_SHOW_REPORTED", "CUSTOMER")
    ).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "COMPLETED", "CUSTOMER")).toBe(
      false
    );

    expect(
      canTransitionBooking("PROVIDER_COMPLETED", "COMPLETED", "CUSTOMER")
    ).toBe(true);
    expect(
      canTransitionBooking("PROVIDER_COMPLETED", "COMPLETED", "SYSTEM")
    ).toBe(true);
    expect(
      canTransitionBooking("PROVIDER_COMPLETED", "DISPUTED", "CUSTOMER")
    ).toBe(true);
    expect(
      canTransitionBooking("PROVIDER_COMPLETED", "DISPUTED", "PROVIDER")
    ).toBe(false);

    expect(
      canTransitionBooking("NO_SHOW_REPORTED", "DISPUTED", "PROVIDER")
    ).toBe(true);
    expect(
      canTransitionBooking("NO_SHOW_REPORTED", "NO_SHOW_PROVIDER", "SYSTEM")
    ).toBe(true);

    expect(canTransitionBooking("DISPUTED", "COMPLETED", "ADMIN")).toBe(true);
    expect(canTransitionBooking("DISPUTED", "COMPLETED", "CUSTOMER")).toBe(
      false
    );

    // Final states have no exits for any actor
    for (const from of BOOKING_STATUSES) {
      if (!isFinalBookingStatus(from)) continue;
      for (const to of BOOKING_STATUSES) {
        expect(canTransitionBooking(from, to, "ADMIN")).toBe(false);
        expect(canTransitionBooking(from, to, "SYSTEM")).toBe(false);
      }
    }
  });
});
