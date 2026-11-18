import { describe, expect, it } from "vitest";
import {
  averageRating,
  formatDistanceLabel,
  isAvailableNow,
  roundDistanceKm,
  sortComparator,
} from "./discovery.js";

describe("Discovery pure domain rules", () => {
  it("DSC-2, D4: rounds distance half up to whole km and shows Under 1 km below 1000m", () => {
    expect(formatDistanceLabel(0)).toBe("Under 1 km");
    expect(formatDistanceLabel(999)).toBe("Under 1 km");
    expect(roundDistanceKm(1499)).toBe(1);
    expect(roundDistanceKm(1500)).toBe(2);
    expect(formatDistanceLabel(1500)).toBe("2 km");
    expect(formatDistanceLabel(2499)).toBe("2 km");
    expect(formatDistanceLabel(2500)).toBe("3 km");
  });

  it("DSC-3: sorts by distance with rating and id tie-breaks, and by rating with distance and id tie-breaks", () => {
    const items = [
      { id: "b", distanceMeters: 2000, averageRating: 4.5 },
      { id: "a", distanceMeters: 2000, averageRating: 4.5 },
      { id: "c", distanceMeters: 2000, averageRating: 5.0 },
      { id: "d", distanceMeters: 1000, averageRating: null },
    ];

    const byDist = [...items].sort(sortComparator("distance")).map((x) => x.id);
    expect(byDist).toEqual(["d", "c", "a", "b"]);

    const byRating = [...items].sort(sortComparator("rating")).map((x) => x.id);
    expect(byRating).toEqual(["c", "a", "b", "d"]);
  });

  it("DSC-1, PRV-8, D1, D2: evaluates Asia/Karachi availability at edges, midnight UTC, and empty windows", () => {
    const windows = [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }];

    // Empty windows + accepting work = always available
    expect(
      isAvailableNow([], true, new Date("2026-11-16T00:00:00.000Z"))
    ).toBe(true);
    // Not accepting work = never available
    expect(
      isAvailableNow([], false, new Date("2026-11-16T10:00:00.000Z"))
    ).toBe(false);

    // 2026-11-16 is Monday. 04:00 UTC = 09:00 Asia/Karachi (exact start edge)
    expect(
      isAvailableNow(windows, true, new Date("2026-11-16T04:00:00.000Z"))
    ).toBe(true);
    // 03:59 UTC = 08:59 Asia/Karachi (1 min before start)
    expect(
      isAvailableNow(windows, true, new Date("2026-11-16T03:59:00.000Z"))
    ).toBe(false);
    // 12:00 UTC = 17:00 Asia/Karachi (exact end boundary -> closed)
    expect(
      isAvailableNow(windows, true, new Date("2026-11-16T12:00:00.000Z"))
    ).toBe(false);

    // Sunday 2026-11-15 19:30 UTC = Monday 2026-11-16 00:30 Asia/Karachi!
    const nightShift = [{ dayOfWeek: 1, startTime: "00:00", endTime: "02:00" }];
    expect(
      isAvailableNow(nightShift, true, new Date("2026-11-15T19:30:00.000Z"))
    ).toBe(true);
  });

  it("RVW-4, D4: averages ratings half up to 1 decimal and returns null when empty", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([5])).toBe(5);
    expect(averageRating([4, 5])).toBe(4.5);
    // (4 + 4 + 5) / 3 = 4.333... -> 4.3
    expect(averageRating([4, 4, 5])).toBe(4.3);
    // (1 + 2) / 2 = 1.5; (1+1+2+2+2+3)/6 = 1.833; check 4.25 -> (4+4+4+5)/4 = 4.25 -> 4.3 (half up!)
    expect(averageRating([4, 4, 4, 5])).toBe(4.3);
  });
});
