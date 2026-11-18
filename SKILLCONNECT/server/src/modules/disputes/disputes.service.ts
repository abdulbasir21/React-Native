import type {
  DisputeDto,
  DisputeStatus,
  FinalBookingStatus,
  MessageDto,
} from "@skillconnect/shared";
import { isAllowedResolutionOutcome } from "../../domain/bookingLifecycle.js";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";
import { createNotification } from "../notifications/notifications.service.js";

const ACTIVE_DISPUTE_STATUSES: DisputeStatus[] = [
  "OPEN",
  "AWAITING_RESPONSE",
  "IN_REVIEW",
];

export function createDisputesService(prisma: PrismaClient) {
  const toDisputeDto = (
    d: {
      id: string;
      bookingId: string;
      type: "ISSUE" | "NO_SHOW";
      openedByUserId: string;
      accusedUserId: string | null;
      reason: string;
      response: string | null;
      respondedAt: Date | null;
      responseDeadline: Date | null;
      status: DisputeStatus;
      outcome: string | null;
      resolutionNote: string | null;
      resolvedByUserId: string | null;
      resolvedAt: Date | null;
      createdAt: Date;
      booking?: {
        id: string;
        serviceName: string;
        price: { toFixed: (n: number) => string };
        scheduledStart: Date;
        status: string;
        serviceAddress: string;
        customerUser: { fullName: string };
        providerProfile: { displayName: string };
      };
    },
    includeAddress: boolean
  ): DisputeDto => ({
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
    ...(d.booking
      ? {
          booking: {
            id: d.booking.id,
            serviceName: d.booking.serviceName,
            pricePkr: d.booking.price.toFixed(0),
            scheduledStart: d.booking.scheduledStart.toISOString(),
            status: d.booking.status as NonNullable<DisputeDto["booking"]>["status"],
            ...(includeAddress
              ? { serviceAddress: d.booking.serviceAddress }
              : {}),
            customerFullName: d.booking.customerUser.fullName,
            providerDisplayName: d.booking.providerProfile.displayName,
          },
        }
      : {}),
  });

  const listAdminDisputes = async (params: {
    status?: DisputeStatus;
    limit: number;
    offset: number;
  }) => {
    const where = params.status ? { status: params.status } : undefined;
    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        take: params.limit,
        skip: params.offset,
        orderBy: { createdAt: "desc" },
        include: {
          booking: {
            include: {
              customerUser: { select: { fullName: true } },
              providerProfile: { select: { displayName: true } },
            },
          },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    return {
      items: items.map((d) => toDisputeDto(d, false)),
      total,
    };
  };

  const getAdminDisputeDetail = async (disputeId: string) => {
    const d = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            customerUser: { select: { fullName: true } },
            providerProfile: { select: { displayName: true } },
          },
        },
      },
    });
    if (!d) {
      throw new AppError(404, "NOT_FOUND", "Dispute not found");
    }
    const isActive = ACTIVE_DISPUTE_STATUSES.includes(d.status);
    return toDisputeDto(d, isActive);
  };

  /**
   * ADM-3: Admin can read the conversation tied to a disputed booking ONLY while
   * the dispute is OPEN, AWAITING_RESPONSE, or IN_REVIEW. Once RESOLVED, returns 404.
   */
  const getDisputedConversation = async (
    disputeId: string
  ): Promise<MessageDto[]> => {
    const d = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { booking: { select: { conversationId: true } } },
    });
    if (!d || !ACTIVE_DISPUTE_STATUSES.includes(d.status)) {
      throw new AppError(404, "NOT_FOUND", "Conversation not accessible");
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: d.booking.conversationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      type: m.type,
      body: m.body,
      imageUrl: m.imageUrl,
      imageFileId: m.imageFileId,
      offerId: m.offerId,
      bookingId: m.bookingId,
      clientMessageId: m.clientMessageId,
      createdAt: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt ? m.deliveredAt.toISOString() : null,
      readAt: m.readAt ? m.readAt.toISOString() : null,
    }));
  };

  /**
   * BKG-13, T9: Admin resolves a DISPUTED booking to one of the 5 final outcomes.
   */
  const resolveDispute = async (
    disputeId: string,
    adminUserId: string,
    outcome: FinalBookingStatus,
    resolutionNote: string,
    nowUtc: Date = new Date()
  ) => {
    if (!isAllowedResolutionOutcome(outcome)) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid resolution outcome");
    }

    const d = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            providerProfile: { select: { userId: true } },
          },
        },
      },
    });
    if (!d) {
      throw new AppError(404, "NOT_FOUND", "Dispute not found");
    }
    if (d.status === "RESOLVED" || d.booking.status !== "DISPUTED") {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        "Dispute is already resolved or booking is not in DISPUTED status"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${d.bookingId}::uuid FOR UPDATE`;

      await tx.booking.update({
        where: { id: d.bookingId },
        data: {
          status: outcome,
          ...(outcome === "COMPLETED" ? { completedAt: nowUtc } : {}),
          ...(outcome === "CANCELLED_BY_CUSTOMER" ||
          outcome === "CANCELLED_BY_PROVIDER"
            ? { cancelledAt: nowUtc, cancelReason: resolutionNote }
            : {}),
        },
      });

      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: "RESOLVED",
          outcome,
          resolutionNote,
          resolvedByUserId: adminUserId,
          resolvedAt: nowUtc,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: d.bookingId,
          fromStatus: d.booking.status,
          toStatus: outcome,
          actorType: "ADMIN",
          actorUserId: adminUserId,
          reason: resolutionNote,
        },
      });

      await createNotification(tx, {
        userId: d.booking.customerUserId,
        type: "DISPUTE_RESOLVED",
        title: "Dispute resolved",
        body: `Admin resolved the dispute for ${d.booking.serviceName} as ${outcome}.`,
        data: { bookingId: d.bookingId, disputeId, outcome },
      });
      await createNotification(tx, {
        userId: d.booking.providerProfile.userId,
        type: "DISPUTE_RESOLVED",
        title: "Dispute resolved",
        body: `Admin resolved the dispute for ${d.booking.serviceName} as ${outcome}.`,
        data: { bookingId: d.bookingId, disputeId, outcome },
      });
    });

    return getAdminDisputeDetail(disputeId);
  };

  return {
    listAdminDisputes,
    getAdminDisputeDetail,
    getDisputedConversation,
    resolveDispute,
  };
}
