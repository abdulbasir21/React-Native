import type { AppConfig } from "../config/env.js";
import { finalNoShowStatus } from "../domain/bookingLifecycle.js";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createNotification } from "../modules/notifications/notifications.service.js";

/**
 * BKG-7: Idempotent job auto-completing PROVIDER_COMPLETED bookings after AUTO_COMPLETE_HOURS
 * when there is no active dispute.
 */
export async function runAutoCompleteJob(
  prisma: PrismaClient,
  config: AppConfig,
  nowUtc: Date = new Date()
): Promise<number> {
  const cutoff = new Date(
    nowUtc.getTime() - config.AUTO_COMPLETE_HOURS * 60 * 60 * 1000
  );

  const candidates = await prisma.booking.findMany({
    where: {
      status: "PROVIDER_COMPLETED",
      providerCompletedAt: { lte: cutoff },
      disputes: {
        none: {
          status: { in: ["OPEN", "AWAITING_RESPONSE", "IN_REVIEW"] },
        },
      },
    },
    include: {
      providerProfile: { select: { userId: true } },
    },
  });

  let count = 0;
  for (const b of candidates) {
    const didUpdate = await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: b.id, status: "PROVIDER_COMPLETED" },
        data: { status: "COMPLETED", completedAt: nowUtc },
      });
      if (res.count === 0) return false;

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: b.id,
          fromStatus: "PROVIDER_COMPLETED",
          toStatus: "COMPLETED",
          actorType: "SYSTEM",
          reason: `Auto-completed after ${config.AUTO_COMPLETE_HOURS} hours`,
        },
      });
      await createNotification(tx, {
        userId: b.customerUserId,
        type: "BOOKING_STATUS_CHANGED",
        title: "Booking auto-completed",
        body: `Your booking for ${b.serviceName} was automatically marked completed.`,
        data: { bookingId: b.id },
      });
      await createNotification(tx, {
        userId: b.providerProfile.userId,
        type: "BOOKING_STATUS_CHANGED",
        title: "Booking completed",
        body: `Booking for ${b.serviceName} was automatically completed.`,
        data: { bookingId: b.id },
      });
      return true;
    });
    if (didUpdate) count++;
  }

  return count;
}

/**
 * BKG-11: Idempotent job finalising NO_SHOW_REPORTED bookings when responseDeadline has passed.
 */
export async function runNoShowDeadlineJob(
  prisma: PrismaClient,
  nowUtc: Date = new Date()
): Promise<number> {
  const expired = await prisma.dispute.findMany({
    where: {
      type: "NO_SHOW",
      status: "AWAITING_RESPONSE",
      responseDeadline: { lte: nowUtc },
    },
    include: {
      booking: {
        include: {
          providerProfile: { select: { userId: true } },
        },
      },
    },
  });

  let count = 0;
  for (const d of expired) {
    if (d.booking.status !== "NO_SHOW_REPORTED") continue;
    const accusedRole =
      d.accusedUserId === d.booking.customerUserId ? "CUSTOMER" : "PROVIDER";
    const finalStatus = finalNoShowStatus(accusedRole);

    const didUpdate = await prisma.$transaction(async (tx) => {
      const res = await tx.booking.updateMany({
        where: { id: d.bookingId, status: "NO_SHOW_REPORTED" },
        data: { status: finalStatus },
      });
      if (res.count === 0) return false;

      await tx.dispute.update({
        where: { id: d.id },
        data: {
          status: "RESOLVED",
          outcome: finalStatus,
          resolutionNote: "Finalised automatically after response deadline",
          resolvedAt: nowUtc,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: d.bookingId,
          fromStatus: "NO_SHOW_REPORTED",
          toStatus: finalStatus,
          actorType: "SYSTEM",
          reason: "No-show response deadline elapsed",
        },
      });

      await createNotification(tx, {
        userId: d.booking.customerUserId,
        type: "BOOKING_STATUS_CHANGED",
        title: "No-show finalised",
        body: `No-show report for ${d.booking.serviceName} finalised as ${finalStatus}.`,
        data: { bookingId: d.bookingId, disputeId: d.id },
      });
      await createNotification(tx, {
        userId: d.booking.providerProfile.userId,
        type: "BOOKING_STATUS_CHANGED",
        title: "No-show finalised",
        body: `No-show report for ${d.booking.serviceName} finalised as ${finalStatus}.`,
        data: { bookingId: d.bookingId, disputeId: d.id },
      });
      return true;
    });
    if (didUpdate) count++;
  }

  return count;
}
