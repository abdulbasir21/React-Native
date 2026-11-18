import type {
  AdminDashboardDto,
  AdminUserDto,
  AdminUsersQuery,
  ProviderDashboardDto,
} from "@skillconnect/shared";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { averageRating } from "../../domain/discovery.js";
import { AppError } from "../../lib/errors.js";
import { createNotification } from "../notifications/notifications.service.js";

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * D1: Computes UTC Date corresponding to 00:00:00.000 Asia/Karachi of nowUtc's day.
 */
export function karachiDayStartUtc(nowUtc: Date): Date {
  const pkt = new Date(nowUtc.getTime() + KARACHI_OFFSET_MS);
  pkt.setUTCHours(0, 0, 0, 0);
  return new Date(pkt.getTime() - KARACHI_OFFSET_MS);
}

/**
 * D1: Computes UTC Date corresponding to Monday 00:00:00.000 Asia/Karachi of nowUtc's week.
 */
export function karachiWeekStartUtc(nowUtc: Date): Date {
  const pkt = new Date(nowUtc.getTime() + KARACHI_OFFSET_MS);
  const jsDay = pkt.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = jsDay === 0 ? 6 : jsDay - 1;
  pkt.setUTCDate(pkt.getUTCDate() - daysSinceMonday);
  pkt.setUTCHours(0, 0, 0, 0);
  return new Date(pkt.getTime() - KARACHI_OFFSET_MS);
}

export function createAdminDashboardService(prisma: PrismaClient) {
  const getAdminDashboard = async (
    nowUtc: Date = new Date()
  ): Promise<AdminDashboardDto> => {
    const dayStart = karachiDayStartUtc(nowUtc);
    const weekStart = karachiWeekStartUtc(nowUtc);

    const [
      pendingProviderVerifications,
      openDisputes,
      bookingsToday,
      bookingsThisWeek,
      completedBookingsTotal,
      activeProvidersTotal,
      recentCancelled,
    ] = await Promise.all([
      prisma.providerProfile.count({ where: { status: "PENDING" } }),
      prisma.dispute.count({
        where: { status: { in: ["OPEN", "AWAITING_RESPONSE", "IN_REVIEW"] } },
      }),
      prisma.booking.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.booking.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.providerProfile.count({
        where: { status: "APPROVED", user: { status: "ACTIVE" } },
      }),
      prisma.booking.findMany({
        where: {
          status: { in: ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_PROVIDER"] },
          cancelledAt: { not: null },
        },
        orderBy: { cancelledAt: "desc" },
        take: 50,
        include: {
          customerUser: { select: { fullName: true } },
          providerProfile: { select: { displayName: true } },
          cancelledByUser: { select: { fullName: true } },
        },
      }),
    ]);

    const lateCancellations = recentCancelled
      .filter(
        (b) =>
          b.cancelledAt !== null &&
          b.scheduledStart.getTime() - b.cancelledAt.getTime() <= DAY_MS
      )
      .slice(0, 20)
      .map((b) => ({
        bookingId: b.id,
        serviceName: b.serviceName,
        customerName: b.customerUser.fullName,
        providerName: b.providerProfile.displayName,
        cancelledByName: b.cancelledByUser?.fullName ?? null,
        cancelledAt: b.cancelledAt!.toISOString(),
        scheduledStart: b.scheduledStart.toISOString(),
        cancelReason: b.cancelReason,
      }));

    return {
      pendingProviderVerifications,
      openDisputes,
      bookingsToday,
      bookingsThisWeek,
      completedBookingsTotal,
      activeProvidersTotal,
      lateCancellations,
    };
  };

  const listUsers = async (query: AdminUsersQuery): Promise<AdminUserDto[]> => {
    const q = query.q?.trim();
    const rows = await prisma.user.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { fullName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        roles: { select: { role: true } },
        providerProfile: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      roles: u.roles.map((r) => r.role),
      providerStatus: u.providerProfile?.status ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  };

  /**
   * ADM-2, ADM-5, AUTH-5:
   * Suspends a non-admin user and revokes all refresh tokens so access stops immediately.
   */
  const suspendUser = async (
    adminUserId: string,
    targetUserId: string,
    reason?: string
  ): Promise<AdminUserDto> => {
    if (adminUserId === targetUserId) {
      throw new AppError(
        400,
        "CANNOT_SUSPEND_SELF",
        "Cannot suspend your own account"
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: { select: { role: true } },
        providerProfile: { select: { status: true } },
      },
    });
    if (!target) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    if (target.roles.some((r) => r.role === "ADMIN")) {
      throw new AppError(
        403,
        "CANNOT_SUSPEND_ADMIN",
        "Cannot suspend an admin account"
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { status: "SUSPENDED" },
        include: {
          roles: { select: { role: true } },
          providerProfile: { select: { status: true } },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await createNotification(tx, {
        userId: targetUserId,
        type: "ACCOUNT_SUSPENDED",
        title: "Account suspended",
        body: reason
          ? `Your account was suspended: ${reason}`
          : "Your account has been suspended by an administrator.",
      });
      return u;
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      status: updated.status,
      roles: updated.roles.map((r) => r.role),
      providerStatus: updated.providerProfile?.status ?? null,
      createdAt: updated.createdAt.toISOString(),
    };
  };

  const reinstateUser = async (
    targetUserId: string
  ): Promise<AdminUserDto> => {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        roles: { select: { role: true } },
        providerProfile: { select: { status: true } },
      },
    });
    if (!target) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    if (target.roles.some((r) => r.role === "ADMIN")) {
      throw new AppError(
        403,
        "CANNOT_MODIFY_ADMIN",
        "Cannot modify an admin account"
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: targetUserId },
        data: { status: "ACTIVE" },
        include: {
          roles: { select: { role: true } },
          providerProfile: { select: { status: true } },
        },
      });
      await createNotification(tx, {
        userId: targetUserId,
        type: "ACCOUNT_REINSTATED",
        title: "Account reinstated",
        body: "Your account has been reinstated by an administrator.",
      });
      return u;
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      status: updated.status,
      roles: updated.roles.map((r) => r.role),
      providerStatus: updated.providerProfile?.status ?? null,
      createdAt: updated.createdAt.toISOString(),
    };
  };

  const getProviderDashboard = async (
    userId: string
  ): Promise<ProviderDashboardDto> => {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(
        404,
        "PROVIDER_PROFILE_NOT_FOUND",
        "Provider profile not found"
      );
    }

    const [
      totalBookings,
      completedBookings,
      activeBookings,
      pendingOffers,
      reviewRows,
    ] = await Promise.all([
      prisma.booking.count({ where: { providerProfileId: profile.id } }),
      prisma.booking.count({
        where: { providerProfileId: profile.id, status: "COMPLETED" },
      }),
      prisma.booking.count({
        where: {
          providerProfileId: profile.id,
          status: {
            in: [
              "CONFIRMED",
              "PROVIDER_COMPLETED",
              "NO_SHOW_REPORTED",
              "DISPUTED",
            ],
          },
        },
      }),
      prisma.serviceOffer.count({
        where: { providerProfileId: profile.id, status: "PENDING" },
      }),
      prisma.review.findMany({
        where: { providerProfileId: profile.id },
        select: { rating: true },
      }),
    ]);

    const ratings = reviewRows.map((r) => r.rating);
    return {
      totalBookings,
      completedBookings,
      activeBookings,
      pendingOffers,
      averageRating: averageRating(ratings),
      reviewCount: ratings.length,
    };
  };

  return {
    getAdminDashboard,
    listUsers,
    suspendUser,
    reinstateUser,
    getProviderDashboard,
  };
}
