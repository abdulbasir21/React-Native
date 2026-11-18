import type {
  BookingDto,
  BookingStatus,
  DisputeDto,
  FinalBookingStatus,
} from "@skillconnect/shared";
import type { AppConfig } from "../../config/env.js";
import {
  canCustomerConfirm,
  canProviderComplete,
  canReportIssue,
  canReportNoShow,
  finalNoShowStatus,
  isLateCancellation,
  noShowDeadline,
} from "../../domain/bookingLifecycle.js";
import { canTransitionBooking } from "../../domain/offersAndBookings.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";
import { createNotification } from "../notifications/notifications.service.js";

export function createBookingsService(prisma: PrismaClient, config: AppConfig) {
  const toBookingDto = (
    b: {
      id: string;
      offerId: string;
      conversationId: string;
      customerUserId: string;
      providerProfileId: string;
      serviceName: string;
      description: string;
      price: { toFixed: (digits: number) => string };
      scheduledStart: Date;
      serviceAddress: string;
      status: BookingStatus;
      providerCompletedAt: Date | null;
      completedAt: Date | null;
      cancelledAt: Date | null;
      cancelledByUserId: string | null;
      cancelReason: string | null;
      createdAt: Date;
      customerUser: { fullName: string };
      providerProfile: { displayName: string };
      history?: {
        id: string;
        fromStatus: BookingStatus | null;
        toStatus: BookingStatus;
        actorType: "USER" | "ADMIN" | "SYSTEM";
        actorUserId: string | null;
        reason: string | null;
        createdAt: Date;
      }[];
    },
    includeAddress: boolean
  ): BookingDto => {
    const late =
      b.cancelledAt !== null
        ? isLateCancellation(
            b.cancelledAt,
            b.scheduledStart,
            config.LATE_CANCEL_HOURS
          )
        : undefined;

    return {
      id: b.id,
      offerId: b.offerId,
      conversationId: b.conversationId,
      customerUserId: b.customerUserId,
      providerProfileId: b.providerProfileId,
      providerDisplayName: b.providerProfile.displayName,
      customerFullName: b.customerUser.fullName,
      serviceName: b.serviceName,
      description: b.description,
      pricePkr: b.price.toFixed(0),
      scheduledStart: b.scheduledStart.toISOString(),
      ...(includeAddress ? { serviceAddress: b.serviceAddress } : {}),
      status: b.status,
      providerCompletedAt: b.providerCompletedAt
        ? b.providerCompletedAt.toISOString()
        : null,
      completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
      cancelledByUserId: b.cancelledByUserId,
      cancelReason: b.cancelReason,
      ...(late !== undefined ? { isLateCancellation: late } : {}),
      createdAt: b.createdAt.toISOString(),
      ...(b.history
        ? {
            history: b.history.map((h) => ({
              id: h.id,
              fromStatus: h.fromStatus,
              toStatus: h.toStatus,
              actorType: h.actorType,
              actorUserId: h.actorUserId,
              reason: h.reason,
              createdAt: h.createdAt.toISOString(),
            })),
          }
        : {}),
    };
  };

  const listMyBookings = async (userId: string): Promise<BookingDto[]> => {
    const rows = await prisma.booking.findMany({
      where: {
        OR: [{ customerUserId: userId }, { providerProfile: { userId } }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        customerUser: { select: { fullName: true } },
        providerProfile: { select: { displayName: true } },
      },
    });
    return rows.map((b) => toBookingDto(b, false));
  };

  const getBookingDetail = async (
    bookingId: string,
    userId: string
  ): Promise<BookingDto & { activeDispute: DisputeDto | null }> => {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customerUser: { select: { fullName: true } },
        providerProfile: { select: { userId: true, displayName: true } },
        history: { orderBy: { createdAt: "asc" } },
        disputes: {
          where: { status: { in: ["OPEN", "AWAITING_RESPONSE", "IN_REVIEW"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (
      !b ||
      (b.customerUserId !== userId && b.providerProfile.userId !== userId)
    ) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }

    const d = b.disputes[0] ?? null;
    return {
      ...toBookingDto(b, true),
      activeDispute: d
        ? {
            id: d.id,
            bookingId: d.bookingId,
            type: d.type,
            openedByUserId: d.openedByUserId,
            accusedUserId: d.accusedUserId,
            reason: d.reason,
            response: d.response,
            respondedAt: d.respondedAt ? d.respondedAt.toISOString() : null,
            responseDeadline: d.responseDeadline
              ? d.responseDeadline.toISOString()
              : null,
            status: d.status,
            outcome: d.outcome as FinalBookingStatus | null,
            resolutionNote: d.resolutionNote,
            resolvedByUserId: d.resolvedByUserId,
            resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
            createdAt: d.createdAt.toISOString(),
          }
        : null,
    };
  };

  async function loadPartyBooking(bookingId: string, userId: string) {
    const b = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        providerProfile: { select: { userId: true, displayName: true } },
        customerUser: { select: { fullName: true } },
      },
    });
    if (!b) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }
    const isCustomer = b.customerUserId === userId;
    const isProvider = b.providerProfile.userId === userId;
    if (!isCustomer && !isProvider) {
      throw new AppError(404, "NOT_FOUND", "Booking not found");
    }
    return { booking: b, isCustomer, isProvider };
  }

  /**
   * BKG-5, T7: Provider marks booking completed at or after scheduledStart.
   */
  const markComplete = async (
    bookingId: string,
    userId: string,
    nowUtc: Date = new Date()
  ) => {
    const { booking, isProvider } = await loadPartyBooking(bookingId, userId);
    if (!isProvider) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the provider can mark this booking completed"
      );
    }
    if (
      !canTransitionBooking(booking.status, "PROVIDER_COMPLETED", "PROVIDER")
    ) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot mark complete from status ${booking.status}`
      );
    }
    if (!canProviderComplete(booking.status, booking.scheduledStart, nowUtc)) {
      throw new AppError(
        409,
        "TOO_EARLY",
        "Cannot mark booking completed before scheduled start time"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "PROVIDER_COMPLETED", providerCompletedAt: nowUtc },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: "PROVIDER_COMPLETED",
          actorType: "USER",
          actorUserId: userId,
          reason: "Provider marked work completed",
        },
      });
      await createNotification(tx, {
        userId: booking.customerUserId,
        type: "BOOKING_STATUS_CHANGED",
        title: "Work marked completed",
        body: `${booking.providerProfile.displayName} marked ${booking.serviceName} completed. Please confirm.`,
        data: { bookingId },
      });
    });

    return getBookingDetail(bookingId, userId);
  };

  /**
   * BKG-6, T7: Customer confirms completion from PROVIDER_COMPLETED.
   */
  const confirmComplete = async (
    bookingId: string,
    userId: string,
    nowUtc: Date = new Date()
  ) => {
    const { booking, isCustomer } = await loadPartyBooking(bookingId, userId);
    if (!isCustomer) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the customer can confirm completion"
      );
    }
    if (!canCustomerConfirm(booking.status)) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot confirm completion from status ${booking.status}`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "COMPLETED", completedAt: nowUtc },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: "COMPLETED",
          actorType: "USER",
          actorUserId: userId,
          reason: "Customer confirmed completion",
        },
      });
      await createNotification(tx, {
        userId: booking.providerProfile.userId,
        type: "BOOKING_STATUS_CHANGED",
        title: "Booking completed",
        body: `${booking.customerUser.fullName} confirmed completion of ${booking.serviceName}.`,
        data: { bookingId },
      });
    });

    return getBookingDetail(bookingId, userId);
  };

  /**
   * BKG-8, T7: Either party can cancel a CONFIRMED booking with a reason.
   */
  const cancelBooking = async (
    bookingId: string,
    userId: string,
    reason: string,
    nowUtc: Date = new Date()
  ) => {
    const { booking, isCustomer } = await loadPartyBooking(bookingId, userId);
    const nextStatus: BookingStatus = isCustomer
      ? "CANCELLED_BY_CUSTOMER"
      : "CANCELLED_BY_PROVIDER";
    const actor = isCustomer ? "CUSTOMER" : "PROVIDER";

    if (!canTransitionBooking(booking.status, nextStatus, actor)) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot cancel booking from status ${booking.status}`
      );
    }

    const otherUserId = isCustomer
      ? booking.providerProfile.userId
      : booking.customerUserId;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: nextStatus,
          cancelledAt: nowUtc,
          cancelledByUserId: userId,
          cancelReason: reason,
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: nextStatus,
          actorType: "USER",
          actorUserId: userId,
          reason,
        },
      });
      await createNotification(tx, {
        userId: otherUserId,
        type: "BOOKING_STATUS_CHANGED",
        title: "Booking cancelled",
        body: `Booking for ${booking.serviceName} was cancelled.`,
        data: { bookingId },
      });
    });

    return getBookingDetail(bookingId, userId);
  };

  /**
   * BKG-10, T7: Report no-show after scheduledStart + NO_SHOW_GRACE_MINUTES.
   */
  const reportNoShow = async (
    bookingId: string,
    userId: string,
    reason: string,
    nowUtc: Date = new Date()
  ) => {
    const { booking, isCustomer } = await loadPartyBooking(bookingId, userId);
    const actor = isCustomer ? "CUSTOMER" : "PROVIDER";

    if (!canTransitionBooking(booking.status, "NO_SHOW_REPORTED", actor)) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot report no-show from status ${booking.status}`
      );
    }
    if (
      !canReportNoShow(
        booking.status,
        booking.scheduledStart,
        nowUtc,
        config.NO_SHOW_GRACE_MINUTES
      )
    ) {
      throw new AppError(
        409,
        "TOO_EARLY",
        `No-show can only be reported ${config.NO_SHOW_GRACE_MINUTES} minutes after scheduled start`
      );
    }

    const accusedUserId = isCustomer
      ? booking.providerProfile.userId
      : booking.customerUserId;
    const deadline = noShowDeadline(nowUtc, config.NO_SHOW_RESPONSE_HOURS);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "NO_SHOW_REPORTED" },
      });
      await tx.dispute.create({
        data: {
          bookingId,
          type: "NO_SHOW",
          openedByUserId: userId,
          accusedUserId,
          reason,
          responseDeadline: deadline,
          status: "AWAITING_RESPONSE",
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: "NO_SHOW_REPORTED",
          actorType: "USER",
          actorUserId: userId,
          reason,
        },
      });
      await createNotification(tx, {
        userId: accusedUserId,
        type: "NO_SHOW_REPORTED",
        title: "No-show reported",
        body: `A no-show was reported for ${booking.serviceName}. Please respond within ${config.NO_SHOW_RESPONSE_HOURS} hours.`,
        data: { bookingId },
      });
    });

    return getBookingDetail(bookingId, userId);
  };

  /**
   * BKG-11, T7: Accused party responds to NO_SHOW_REPORTED ("accept" or "dispute").
   */
  const respondToNoShow = async (
    bookingId: string,
    userId: string,
    action: "accept" | "dispute",
    responseText?: string,
    nowUtc: Date = new Date()
  ) => {
    const { booking, isCustomer } = await loadPartyBooking(bookingId, userId);
    if (booking.status !== "NO_SHOW_REPORTED") {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Cannot respond to no-show from status ${booking.status}`
      );
    }

    const dispute = await prisma.dispute.findFirst({
      where: { bookingId, type: "NO_SHOW", status: "AWAITING_RESPONSE" },
    });
    if (!dispute || dispute.accusedUserId !== userId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the accused party can respond to this no-show report"
      );
    }

    if (dispute.responseDeadline && nowUtc > dispute.responseDeadline) {
      throw new AppError(
        409,
        "DEADLINE_PASSED",
        "Response deadline has passed"
      );
    }

    const accusedRole = isCustomer ? "CUSTOMER" : "PROVIDER";
    const nextStatus: BookingStatus =
      action === "accept" ? finalNoShowStatus(accusedRole) : "DISPUTED";

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: nextStatus },
      });
      await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          response: responseText ?? (action === "accept" ? "Accepted" : null),
          respondedAt: nowUtc,
          status: action === "accept" ? "RESOLVED" : "IN_REVIEW",
          ...(action === "accept"
            ? { outcome: nextStatus, resolvedAt: nowUtc }
            : {}),
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: nextStatus,
          actorType: "USER",
          actorUserId: userId,
          reason:
            action === "accept"
              ? "Accused accepted no-show"
              : responseText ?? "Accused disputed no-show",
        },
      });
      await createNotification(tx, {
        userId: dispute.openedByUserId,
        type: "NO_SHOW_RESPONDED",
        title: "No-show response received",
        body:
          action === "accept"
            ? `No-show for ${booking.serviceName} was accepted.`
            : `No-show for ${booking.serviceName} was disputed and sent to admin review.`,
        data: { bookingId, disputeId: dispute.id },
      });
    });

    return getBookingDetail(bookingId, userId);
  };

  /**
   * BKG-12, T8: Customer reports an issue while booking is PROVIDER_COMPLETED.
   */
  const reportIssue = async (
    bookingId: string,
    userId: string,
    reason: string
  ) => {
    const { booking, isCustomer } = await loadPartyBooking(bookingId, userId);
    if (!isCustomer) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the customer can report an issue"
      );
    }
    if (!canReportIssue(booking.status)) {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Issues can only be reported when booking is PROVIDER_COMPLETED (current: ${booking.status})`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "DISPUTED" },
      });
      const dispute = await tx.dispute.create({
        data: {
          bookingId,
          type: "ISSUE",
          openedByUserId: userId,
          reason,
          status: "OPEN",
        },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: booking.status,
          toStatus: "DISPUTED",
          actorType: "USER",
          actorUserId: userId,
          reason,
        },
      });
      await createNotification(tx, {
        userId: booking.providerProfile.userId,
        type: "DISPUTE_OPENED",
        title: "Issue reported",
        body: `Customer reported an issue for ${booking.serviceName}. Admin review requested.`,
        data: { bookingId, disputeId: dispute.id },
      });
    });

    return getBookingDetail(bookingId, userId);
  };

  return {
    listMyBookings,
    getBookingDetail,
    markComplete,
    confirmComplete,
    cancelBooking,
    reportNoShow,
    respondToNoShow,
    reportIssue,
  };
}
