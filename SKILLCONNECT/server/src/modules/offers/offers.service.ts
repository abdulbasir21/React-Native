import crypto from "node:crypto";
import type {
  AcceptOfferInput,
  BookingDto,
  CreateOfferInput,
  OfferStatus,
  ServiceOfferDto,
} from "@skillconnect/shared";
import type { AppConfig } from "../../config/env.js";
import {
  computeOfferExpiry,
  isOfferExpired,
  validateOfferInput,
} from "../../domain/offersAndBookings.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/index.js";
import { AppError } from "../../lib/errors.js";
import { createNotification } from "../notifications/notifications.service.js";

function toOfferDto(o: {
  id: string;
  conversationId: string;
  providerProfileId: string;
  customerUserId: string;
  serviceName: string;
  description: string;
  price: Prisma.Decimal;
  proposedStart: Date;
  terms: string | null;
  status: OfferStatus;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
}): ServiceOfferDto {
  return {
    id: o.id,
    conversationId: o.conversationId,
    providerProfileId: o.providerProfileId,
    customerUserId: o.customerUserId,
    serviceName: o.serviceName,
    description: o.description,
    pricePkr: o.price.toFixed(0),
    proposedStart: o.proposedStart.toISOString(),
    terms: o.terms,
    status: o.status,
    expiresAt: o.expiresAt.toISOString(),
    respondedAt: o.respondedAt ? o.respondedAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  };
}

interface LockedOfferRow {
  id: string;
  conversation_id: string;
  provider_profile_id: string;
  customer_user_id: string;
  service_name: string;
  description: string;
  price: string;
  proposed_start: Date;
  status: OfferStatus;
  expires_at: Date;
}

export function createOffersService(prisma: PrismaClient, config: AppConfig) {
  const listConversationOffers = async (
    conversationId: string,
    userId: string
  ): Promise<ServiceOfferDto[]> => {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId } } },
      select: { id: true },
    });
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }

    const rows = await prisma.serviceOffer.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toOfferDto);
  };

  /**
   * OFR-1, OFR-2, OFR-3, OFR-4, T4:
   * Provider creates an immutable offer; supersedes any existing PENDING offer in one transaction.
   */
  const createOffer = async (
    conversationId: string,
    callerUserId: string,
    input: CreateOfferInput,
    nowUtc: Date = new Date()
  ) => {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId: callerUserId } } },
      include: {
        providerProfile: {
          include: { user: { select: { id: true, status: true } } },
        },
        customerUser: { select: { id: true, status: true } },
      },
    });
    if (!conv) {
      throw new AppError(404, "NOT_FOUND", "Conversation not found");
    }

    // OFR-1: Only the conversation's APPROVED & ACTIVE provider can create offers
    if (conv.providerProfile.userId !== callerUserId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the provider in this conversation can create an offer"
      );
    }
    if (
      conv.providerProfile.status !== "APPROVED" ||
      conv.providerProfile.user.status !== "ACTIVE"
    ) {
      throw new AppError(
        403,
        "PROVIDER_NOT_APPROVED",
        "Only approved active providers can create offers"
      );
    }

    const proposedStart = new Date(input.proposedStart);
    const errors = validateOfferInput(
      {
        serviceName: input.serviceName,
        description: input.description,
        pricePkr: input.pricePkr,
        proposedStart,
        terms: input.terms,
      },
      nowUtc,
      {
        offerMinLeadMinutes: config.OFFER_MIN_LEAD_MINUTES,
        offerMaxDaysAhead: config.OFFER_MAX_DAYS_AHEAD,
        offerMaxPricePkr: config.OFFER_MAX_PRICE_PKR,
      }
    );
    if (errors.length > 0) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        errors[0]!,
        errors.map((message) => ({ message }))
      );
    }

    const expiresAt = computeOfferExpiry(
      nowUtc,
      proposedStart,
      config.OFFER_EXPIRY_HOURS
    );

    const result = await prisma.$transaction(async (tx) => {
      await tx.serviceOffer.updateMany({
        where: { conversationId, status: "PENDING" },
        data: { status: "SUPERSEDED", respondedAt: nowUtc },
      });

      const offer = await tx.serviceOffer.create({
        data: {
          conversationId,
          providerProfileId: conv.providerProfileId,
          customerUserId: conv.customerUserId,
          serviceName: input.serviceName,
          description: input.description,
          price: new Prisma.Decimal(input.pricePkr),
          proposedStart,
          terms: input.terms ?? null,
          status: "PENDING",
          expiresAt,
        },
      });

      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: callerUserId,
          type: "OFFER",
          body: `${offer.serviceName} — Rs. ${offer.price.toFixed(0)}`,
          offerId: offer.id,
          clientMessageId: `offer:${offer.id}`,
        },
      });

      await createNotification(tx, {
        userId: conv.customerUserId,
        type: "OFFER_RECEIVED",
        title: "New service offer",
        body: `${conv.providerProfile.displayName} sent an offer for ${offer.serviceName}`,
        data: { conversationId, offerId: offer.id },
      });

      return { offer: toOfferDto(offer), message: msg };
    });

    return {
      ...result,
      customerUserId: conv.customerUserId,
      providerUserId: conv.providerProfile.userId,
    };
  };

  const withdrawOffer = async (
    offerId: string,
    callerUserId: string,
    nowUtc: Date = new Date()
  ) => {
    const offer = await prisma.serviceOffer.findUnique({
      where: { id: offerId },
      include: {
        providerProfile: { select: { userId: true, displayName: true } },
        conversation: { include: { participants: true } },
      },
    });
    if (
      !offer ||
      !offer.conversation.participants.some((p) => p.userId === callerUserId)
    ) {
      throw new AppError(404, "NOT_FOUND", "Offer not found");
    }
    if (offer.providerProfile.userId !== callerUserId) {
      throw new AppError(403, "FORBIDDEN", "Only the provider can withdraw");
    }
    if (offer.status !== "PENDING") {
      throw new AppError(
        409,
        "OFFER_NOT_PENDING",
        `Offer cannot be withdrawn from status ${offer.status}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.serviceOffer.update({
        where: { id: offerId },
        data: { status: "WITHDRAWN", respondedAt: nowUtc },
      });
      await createNotification(tx, {
        userId: offer.customerUserId,
        type: "OFFER_WITHDRAWN",
        title: "Offer withdrawn",
        body: `${offer.providerProfile.displayName} withdrew the offer for ${offer.serviceName}`,
        data: { conversationId: offer.conversationId, offerId: offer.id },
      });
      return toOfferDto(row);
    });

    return {
      offer: updated,
      customerUserId: offer.customerUserId,
      providerUserId: offer.providerProfile.userId,
    };
  };

  const declineOffer = async (
    offerId: string,
    callerUserId: string,
    nowUtc: Date = new Date()
  ) => {
    const offer = await prisma.serviceOffer.findUnique({
      where: { id: offerId },
      include: {
        providerProfile: { select: { userId: true } },
        conversation: { include: { participants: true } },
      },
    });
    if (
      !offer ||
      !offer.conversation.participants.some((p) => p.userId === callerUserId)
    ) {
      throw new AppError(404, "NOT_FOUND", "Offer not found");
    }
    if (offer.customerUserId !== callerUserId) {
      throw new AppError(403, "FORBIDDEN", "Only the customer can decline");
    }
    if (offer.status !== "PENDING") {
      throw new AppError(
        409,
        "OFFER_NOT_PENDING",
        `Offer cannot be declined from status ${offer.status}`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.serviceOffer.update({
        where: { id: offerId },
        data: { status: "DECLINED", respondedAt: nowUtc },
      });
      await createNotification(tx, {
        userId: offer.providerProfile.userId,
        type: "OFFER_DECLINED",
        title: "Offer declined",
        body: `Customer declined the offer for ${offer.serviceName}`,
        data: { conversationId: offer.conversationId, offerId: offer.id },
      });
      return toOfferDto(row);
    });

    return {
      offer: updated,
      customerUserId: offer.customerUserId,
      providerUserId: offer.providerProfile.userId,
    };
  };

  /**
   * BKG-1, BKG-2, BKG-3, BKG-14, BKG-16, OFR-7, T5:
   * Accepts an offer in ONE transaction with SELECT ... FOR UPDATE row lock.
   */
  const acceptOffer = async (
    offerId: string,
    callerUserId: string,
    input: AcceptOfferInput,
    nowUtc: Date = new Date(),
    beforeCommitHook?: () => void
  ): Promise<{
    booking: BookingDto;
    alreadyExisted: boolean;
    providerUserId: string;
    bookingMessageId?: string;
  }> => {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedOfferRow[]>`
        SELECT
          id,
          conversation_id,
          provider_profile_id,
          customer_user_id,
          service_name,
          description,
          price::text,
          proposed_start,
          status::text,
          expires_at
        FROM service_offers
        WHERE id = ${offerId}::uuid
        FOR UPDATE
      `;

      const offer = locked[0];
      if (!offer) {
        throw new AppError(404, "NOT_FOUND", "Offer not found");
      }

      const providerProfile = await tx.providerProfile.findUnique({
        where: { id: offer.provider_profile_id },
        include: { user: { select: { id: true, status: true } } },
      });
      if (!providerProfile) {
        throw new AppError(404, "NOT_FOUND", "Provider not found");
      }

      // Non-participant -> 404; provider trying to accept -> 403
      if (offer.customer_user_id !== callerUserId) {
        if (providerProfile.userId === callerUserId) {
          throw new AppError(
            403,
            "FORBIDDEN",
            "Only the offer customer can accept"
          );
        }
        throw new AppError(404, "NOT_FOUND", "Offer not found");
      }

      // BKG-2: Repeat accept by the same customer returns existing booking with 200
      if (offer.status === "ACCEPTED") {
        const existing = await tx.booking.findUnique({
          where: { offerId: offer.id },
          include: {
            customerUser: { select: { fullName: true } },
            providerProfile: { select: { displayName: true } },
          },
        });
        if (!existing) {
          throw new AppError(409, "OFFER_NOT_PENDING", "Offer already accepted");
        }
        return {
          booking: {
            id: existing.id,
            offerId: existing.offerId,
            conversationId: existing.conversationId,
            customerUserId: existing.customerUserId,
            providerProfileId: existing.providerProfileId,
            providerDisplayName: existing.providerProfile.displayName,
            customerFullName: existing.customerUser.fullName,
            serviceName: existing.serviceName,
            description: existing.description,
            pricePkr: existing.price.toFixed(0),
            scheduledStart: existing.scheduledStart.toISOString(),
            serviceAddress: existing.serviceAddress,
            status: existing.status,
            providerCompletedAt: existing.providerCompletedAt
              ? existing.providerCompletedAt.toISOString()
              : null,
            completedAt: existing.completedAt
              ? existing.completedAt.toISOString()
              : null,
            cancelledAt: existing.cancelledAt
              ? existing.cancelledAt.toISOString()
              : null,
            cancelledByUserId: existing.cancelledByUserId,
            cancelReason: existing.cancelReason,
            createdAt: existing.createdAt.toISOString(),
          },
          alreadyExisted: true,
          providerUserId: providerProfile.userId,
        };
      }

      if (offer.status !== "PENDING") {
        throw new AppError(
          409,
          "OFFER_NOT_PENDING",
          `Offer is ${offer.status}`
        );
      }

      // OFR-7: Server clock expiry check
      if (isOfferExpired(offer.expires_at, nowUtc)) {
        throw new AppError(409, "OFFER_EXPIRED", "This offer has expired");
      }

      if (
        providerProfile.status !== "APPROVED" ||
        providerProfile.user.status !== "ACTIVE"
      ) {
        throw new AppError(
          409,
          "PROVIDER_NOT_APPROVED",
          "Provider is no longer active or approved"
        );
      }

      const customer = await tx.user.findUnique({
        where: { id: offer.customer_user_id },
        select: { fullName: true },
      });

      const bookingId = crypto.randomUUID();
      const createdBooking = await tx.booking.create({
        data: {
          id: bookingId,
          offerId: offer.id,
          conversationId: offer.conversation_id,
          customerUserId: offer.customer_user_id,
          providerProfileId: offer.provider_profile_id,
          serviceName: offer.service_name,
          description: offer.description,
          price: new Prisma.Decimal(offer.price),
          scheduledStart: offer.proposed_start,
          serviceAddress: input.serviceAddress,
          status: "CONFIRMED",
        },
      });

      if (input.lat !== undefined && input.lng !== undefined) {
        await tx.$executeRaw`
          UPDATE bookings
          SET service_location = ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography
          WHERE id = ${bookingId}::uuid
        `;
      }

      await tx.serviceOffer.update({
        where: { id: offer.id },
        data: { status: "ACCEPTED", respondedAt: nowUtc },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: null,
          toStatus: "CONFIRMED",
          actorType: "USER",
          actorUserId: callerUserId,
          reason: "Offer accepted",
        },
      });

      const bookingMsg = await tx.message.create({
        data: {
          conversationId: offer.conversation_id,
          senderId: callerUserId,
          type: "BOOKING",
          body: `Booking confirmed: ${offer.service_name} (Rs. ${new Prisma.Decimal(offer.price).toFixed(0)})`,
          bookingId,
          clientMessageId: `booking:${bookingId}`,
        },
      });

      // NTF-3: Never include serviceAddress in push/notification text
      await createNotification(tx, {
        userId: offer.customer_user_id,
        type: "BOOKING_CONFIRMED",
        title: "Booking confirmed",
        body: `Your booking for ${offer.service_name} is confirmed.`,
        data: { bookingId, conversationId: offer.conversation_id },
      });
      await createNotification(tx, {
        userId: providerProfile.userId,
        type: "OFFER_ACCEPTED",
        title: "Offer accepted",
        body: `${customer?.fullName ?? "Customer"} accepted your offer for ${offer.service_name}.`,
        data: { bookingId, conversationId: offer.conversation_id },
      });

      if (beforeCommitHook) {
        beforeCommitHook();
      }

      return {
        booking: {
          id: createdBooking.id,
          offerId: createdBooking.offerId,
          conversationId: createdBooking.conversationId,
          customerUserId: createdBooking.customerUserId,
          providerProfileId: createdBooking.providerProfileId,
          providerDisplayName: providerProfile.displayName,
          customerFullName: customer?.fullName ?? "",
          serviceName: createdBooking.serviceName,
          description: createdBooking.description,
          pricePkr: createdBooking.price.toFixed(0),
          scheduledStart: createdBooking.scheduledStart.toISOString(),
          serviceAddress: createdBooking.serviceAddress,
          status: createdBooking.status,
          providerCompletedAt: null,
          completedAt: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancelReason: null,
          createdAt: createdBooking.createdAt.toISOString(),
        },
        alreadyExisted: false,
        providerUserId: providerProfile.userId,
        bookingMessageId: bookingMsg.id,
      };
    });
  };

  return {
    listConversationOffers,
    createOffer,
    withdrawOffer,
    declineOffer,
    acceptOffer,
  };
}
