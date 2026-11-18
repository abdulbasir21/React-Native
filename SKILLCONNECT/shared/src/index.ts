export const ROLES = ["GUEST", "CUSTOMER", "PROVIDER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROVIDER_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export interface ApiSuccessResponse<T, M = Record<string, unknown>> {
  success: true;
  data: T;
  meta?: M;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: Exclude<Role, "GUEST">[];
}

export * from "./auth.js";
export * from "./catalog.js";
export * from "./provider.js";
export * from "./discovery.js";
export * from "./chat.js";
export * from "./offersAndBookings.js";
export * from "./disputes.js";
export * from "./reviews.js";
export * from "./notifications.js";
export * from "./dashboard.js";
export * from "./release2.js";
