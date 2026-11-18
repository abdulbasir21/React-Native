import type { ProviderSearchSort } from "@skillconnect/shared";

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * DSC-2, D4: Rounds distance in meters half-up to the nearest whole km.
 */
export function roundDistanceKm(meters: number): number {
  if (meters <= 0) return 0;
  return Math.floor(meters / 1000 + 0.5);
}

/**
 * DSC-2, D4: Below 1 km returns "Under 1 km", otherwise "<N> km".
 */
export function formatDistanceLabel(meters: number): string {
  if (meters < 1000) return "Under 1 km";
  return `${roundDistanceKm(meters)} km`;
}

/**
 * D1, D2: Converts a UTC Date to Asia/Karachi (UTC+5, no DST) ISO weekday (1..7) and HH:MM.
 */
export function toKarachiTimeParts(nowUtc: Date): {
  dayOfWeek: number;
  hhmm: string;
} {
  const pkt = new Date(nowUtc.getTime() + KARACHI_OFFSET_MS);
  const jsDay = pkt.getUTCDay(); // 0=Sun..6=Sat
  const dayOfWeek = jsDay === 0 ? 7 : jsDay; // ISO 1=Mon..7=Sun
  const hh = String(pkt.getUTCHours()).padStart(2, "0");
  const mm = String(pkt.getUTCMinutes()).padStart(2, "0");
  return { dayOfWeek, hhmm: `${hh}:${mm}` };
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/**
 * DSC-1, PRV-8, D2: Evaluates whether provider is available at nowUtc in Asia/Karachi.
 * Empty windows with isAcceptingWork = true means available at all times.
 */
export function isAvailableNow(
  windows: AvailabilitySlot[],
  isAcceptingWork: boolean,
  nowUtc: Date
): boolean {
  if (!isAcceptingWork) return false;
  if (windows.length === 0) return true;
  const { dayOfWeek, hhmm } = toKarachiTimeParts(nowUtc);
  return windows.some(
    (w) => w.dayOfWeek === dayOfWeek && w.startTime <= hhmm && hhmm < w.endTime
  );
}

/**
 * RVW-4, D4: Average rating rounded half-up to 1 decimal place, or null if empty.
 */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return Math.floor((sum / ratings.length) * 10 + 0.5) / 10;
}

export interface SortableProvider {
  id: string;
  distanceMeters: number;
  averageRating: number | null;
}

/**
 * DSC-3: Comparator for provider discovery sorting.
 */
export function sortComparator(sortBy: ProviderSearchSort) {
  return (a: SortableProvider, b: SortableProvider): number => {
    const ratingA = a.averageRating ?? -1;
    const ratingB = b.averageRating ?? -1;

    if (sortBy === "rating") {
      if (ratingB !== ratingA) return ratingB - ratingA;
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }
      return a.id.localeCompare(b.id);
    }

    if (a.distanceMeters !== b.distanceMeters) {
      return a.distanceMeters - b.distanceMeters;
    }
    if (ratingB !== ratingA) return ratingB - ratingA;
    return a.id.localeCompare(b.id);
  };
}
