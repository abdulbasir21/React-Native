import { z } from "zod";

export const createReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export interface ReviewDto {
  id: string;
  bookingId: string;
  customerUserId: string;
  customerName: string;
  providerProfileId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface ProviderReviewsResponseDto {
  averageRating: number | null;
  reviewCount: number;
  reviews: ReviewDto[];
}
