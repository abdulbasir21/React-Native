import type {
  CreateReviewInput,
  ProviderReviewsResponseDto,
  ReviewDto,
} from "@skillconnect/shared";
import type { PrismaClient } from "../../generated/prisma/index.js";
import { averageRating } from "../../domain/discovery.js";
import { AppError } from "../../lib/errors.js";
import { createNotification } from "../notifications/notifications.service.js";

function toReviewDto(row: {
  id: string;
  bookingId: string;
  customerUserId: string;
  providerProfileId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  customerUser: { fullName: string };
}): ReviewDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    customerUserId: row.customerUserId,
    customerName: row.customerUser.fullName,
    providerProfileId: row.providerProfileId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createReviewsService(prisma: PrismaClient) {
  /**
   * RVW-1, RVW-2, RVW-3, T10:
   * Customer of a COMPLETED booking creates a single immutable review.
   */
  const createReview = async (
    bookingId: string,
    userId: string,
    input: CreateReviewInput
  ): Promise<ReviewDto> => {
    return prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          customerUserId: true,
          providerProfileId: true,
          status: true,
          providerProfile: { select: { userId: true } },
          review: { select: { id: true } },
        },
      });

      if (!booking) {
        throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
      }
      if (booking.customerUserId !== userId) {
        throw new AppError(
          403,
          "REVIEW_FORBIDDEN",
          "Only the booking customer can leave a review"
        );
      }
      if (booking.status !== "COMPLETED") {
        throw new AppError(
          409,
          "REVIEW_BOOKING_NOT_COMPLETED",
          "Only completed bookings can be reviewed"
        );
      }
      if (booking.review) {
        throw new AppError(
          409,
          "REVIEW_ALREADY_EXISTS",
          "This booking has already been reviewed"
        );
      }

      const created = await tx.review.create({
        data: {
          bookingId: booking.id,
          customerUserId: userId,
          providerProfileId: booking.providerProfileId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        include: {
          customerUser: { select: { fullName: true } },
        },
      });

      await createNotification(tx, {
        userId: booking.providerProfile.userId,
        type: "REVIEW_RECEIVED",
        title: "New review received",
        body: `You received a ${input.rating}-star review.`,
        data: {
          bookingId: booking.id,
          reviewId: created.id,
        },
      });

      return toReviewDto(created);
    });
  };

  /**
   * RVW-4, PRV-3, PRV-4:
   * Lists reviews for a provider, plus calculated averageRating (half-up 1 decimal) and reviewCount.
   */
  const listProviderReviews = async (
    providerProfileId: string,
    requester?: { id: string; roles: string[] }
  ): Promise<ProviderReviewsResponseDto> => {
    const provider = await prisma.providerProfile.findUnique({
      where: { id: providerProfileId },
      select: {
        id: true,
        userId: true,
        status: true,
        user: { select: { status: true } },
      },
    });

    if (!provider) {
      throw new AppError(404, "PROVIDER_NOT_FOUND", "Provider not found");
    }

    const isPubliclyVisible =
      provider.status === "APPROVED" && provider.user.status === "ACTIVE";
    const isOwner = requester?.id === provider.userId;
    const isAdmin = requester?.roles.includes("ADMIN") ?? false;

    if (!isPubliclyVisible && !isOwner && !isAdmin) {
      throw new AppError(404, "PROVIDER_NOT_FOUND", "Provider not found");
    }

    const rows = await prisma.review.findMany({
      where: { providerProfileId },
      include: {
        customerUser: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      averageRating: averageRating(rows.map((r) => r.rating)),
      reviewCount: rows.length,
      reviews: rows.map(toReviewDto),
    };
  };

  return { createReview, listProviderReviews };
}
