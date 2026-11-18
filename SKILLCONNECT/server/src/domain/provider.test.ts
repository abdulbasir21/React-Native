import { describe, expect, it } from "vitest";
import {
  canTransitionProviderStatus,
  validateAvailabilityWindows,
  validateProviderSubmission,
} from "./provider.js";

describe("Provider pure domain rules", () => {
  it("PRV-1: enforces allowed and forbidden provider status transitions", () => {
    expect(canTransitionProviderStatus("DRAFT", "PENDING")).toBe(true);
    expect(canTransitionProviderStatus("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionProviderStatus("PENDING", "REJECTED")).toBe(true);
    expect(canTransitionProviderStatus("REJECTED", "PENDING")).toBe(true);
    expect(canTransitionProviderStatus("APPROVED", "SUSPENDED")).toBe(true);
    expect(canTransitionProviderStatus("SUSPENDED", "APPROVED")).toBe(true);

    // Forbidden transitions
    expect(canTransitionProviderStatus("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionProviderStatus("APPROVED", "PENDING")).toBe(false);
    expect(canTransitionProviderStatus("REJECTED", "APPROVED")).toBe(false);
    expect(canTransitionProviderStatus("SUSPENDED", "PENDING")).toBe(false);
  });

  it("PRV-2: requires all submission fields within bounds", () => {
    const valid = {
      displayName: "Ustad Tariq Electric",
      photoUrl: "https://ik.imagekit.io/demo/p.jpg",
      description: "Certified residential electrician with 10 years field experience.",
      experienceYears: 10,
      servicesCount: 1,
      serviceArea: { radiusKm: 15 },
      portfolioCount: 2,
    };
    expect(validateProviderSubmission(valid)).toEqual([]);

    expect(
      validateProviderSubmission({
        ...valid,
        photoUrl: null,
        description: "Too short",
        servicesCount: 0,
        serviceArea: null,
        portfolioCount: 11,
      }).length
    ).toBe(5);
  });

  it("PRV-8: rejects reversed or overlapping availability windows and allows empty", () => {
    expect(validateAvailabilityWindows([])).toEqual([]);
    expect(
      validateAvailabilityWindows([
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "12:00", endTime: "17:00" },
      ])
    ).toEqual([]);

    expect(
      validateAvailabilityWindows([
        { dayOfWeek: 1, startTime: "14:00", endTime: "12:00" },
      ]).length
    ).toBeGreaterThan(0);

    expect(
      validateAvailabilityWindows([
        { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
        { dayOfWeek: 2, startTime: "12:30", endTime: "16:00" },
      ]).length
    ).toBeGreaterThan(0);
  });
});
