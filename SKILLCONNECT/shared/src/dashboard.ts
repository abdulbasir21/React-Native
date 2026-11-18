import { z } from "zod";
import type { ProviderStatus, Role, UserStatus } from "./index.js";

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const userActionSchema = z
  .object({
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .strict();

export type UserActionInput = z.infer<typeof userActionSchema>;

export interface LateCancellationItemDto {
  bookingId: string;
  serviceName: string;
  customerName: string;
  providerName: string;
  cancelledByName: string | null;
  cancelledAt: string;
  scheduledStart: string;
  cancelReason: string | null;
}

export interface AdminDashboardDto {
  pendingProviderVerifications: number;
  openDisputes: number;
  bookingsToday: number;
  bookingsThisWeek: number;
  completedBookingsTotal: number;
  activeProvidersTotal: number;
  lateCancellations: LateCancellationItemDto[];
}

export interface AdminUserDto {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  roles: Exclude<Role, "GUEST">[];
  providerStatus: ProviderStatus | null;
  createdAt: string;
}

export interface ProviderDashboardDto {
  totalBookings: number;
  completedBookings: number;
  activeBookings: number;
  pendingOffers: number;
  averageRating: number | null;
  reviewCount: number;
}
