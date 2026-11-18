import type { ProviderStatus, VerificationDecision } from "@skillconnect/shared";

const ALLOWED_PROVIDER_TRANSITIONS: Record<ProviderStatus, ProviderStatus[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  REJECTED: ["PENDING"],
  SUSPENDED: ["APPROVED"],
};

/**
 * PRV-1: Validates provider status transitions.
 */
export function canTransitionProviderStatus(
  from: ProviderStatus,
  to: ProviderStatus
): boolean {
  return ALLOWED_PROVIDER_TRANSITIONS[from].includes(to);
}

/**
 * Maps an admin decision to the resulting provider status.
 */
export function targetStatusForDecision(
  decision: VerificationDecision
): ProviderStatus {
  switch (decision) {
    case "APPROVED":
    case "REINSTATED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "SUSPENDED":
      return "SUSPENDED";
  }
}

export interface SubmissionCheckInput {
  displayName: string | null;
  photoUrl: string | null;
  description: string | null;
  experienceYears: number | null;
  servicesCount: number;
  serviceArea: { radiusKm: number } | null;
  portfolioCount: number;
}

/**
 * PRV-2: Validates all required fields and limits before submitting a provider profile.
 */
export function validateProviderSubmission(input: SubmissionCheckInput): string[] {
  const errors: string[] = [];
  const displayName = input.displayName?.trim() ?? "";
  if (displayName.length < 2 || displayName.length > 60) {
    errors.push("Display name must be between 2 and 60 characters");
  }
  if (!input.photoUrl) {
    errors.push("Profile photo is required");
  }
  const description = input.description?.trim() ?? "";
  if (description.length < 30 || description.length > 1000) {
    errors.push("Description must be between 30 and 1000 characters");
  }
  if (
    input.experienceYears === null ||
    !Number.isInteger(input.experienceYears) ||
    input.experienceYears < 0 ||
    input.experienceYears > 60
  ) {
    errors.push("Experience years must be between 0 and 60");
  }
  if (input.servicesCount < 1) {
    errors.push("At least one service is required");
  }
  if (!input.serviceArea) {
    errors.push("Service area is required");
  } else if (
    !Number.isInteger(input.serviceArea.radiusKm) ||
    input.serviceArea.radiusKm < 1 ||
    input.serviceArea.radiusKm > 30
  ) {
    errors.push("Service area radius must be between 1 and 30 km");
  }
  if (input.portfolioCount > 10) {
    errors.push("Maximum 10 portfolio images allowed");
  }
  return errors;
}

export interface AvailabilityInputWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * PRV-8: Validates weekly availability windows (ISO day 1..7, HH:MM, start < end, no overlap per day).
 */
export function validateAvailabilityWindows(
  windows: AvailabilityInputWindow[]
): string[] {
  const errors: string[] = [];
  const byDay = new Map<number, AvailabilityInputWindow[]>();

  for (const w of windows) {
    if (!Number.isInteger(w.dayOfWeek) || w.dayOfWeek < 1 || w.dayOfWeek > 7) {
      errors.push(`Invalid dayOfWeek: ${w.dayOfWeek}`);
      continue;
    }
    if (!HHMM_RE.test(w.startTime) || !HHMM_RE.test(w.endTime)) {
      errors.push(`Invalid time format on day ${w.dayOfWeek}`);
      continue;
    }
    if (w.startTime >= w.endTime) {
      errors.push(`startTime must be before endTime on day ${w.dayOfWeek}`);
      continue;
    }
    const list = byDay.get(w.dayOfWeek) ?? [];
    list.push(w);
    byDay.set(w.dayOfWeek, list);
  }

  for (const [day, list] of byDay.entries()) {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startTime < sorted[i - 1]!.endTime) {
        errors.push(`Overlapping availability windows on day ${day}`);
        break;
      }
    }
  }

  return errors;
}
