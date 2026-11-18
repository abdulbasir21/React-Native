import { z } from "zod";

export const PROVIDER_SEARCH_SORTS = ["distance", "rating"] as const;
export type ProviderSearchSort = (typeof PROVIDER_SEARCH_SORTS)[number];

export const providerSearchQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  categoryId: z.string().uuid().optional(),
  q: z
    .string()
    .trim()
    .min(2, "Search query must be at least 2 characters")
    .max(100)
    .optional(),
  availableNow: z
    .preprocess((v) => v === true || v === "true" || v === "1", z.boolean())
    .default(false),
  sort: z.enum(PROVIDER_SEARCH_SORTS).default("distance"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ProviderSearchQuery = z.infer<typeof providerSearchQuerySchema>;

export interface ProviderSearchResultDto {
  id: string;
  userId: string;
  displayName: string;
  photoUrl: string | null;
  experienceYears: number | null;
  isAcceptingWork: boolean;
  isAvailableNow: boolean;
  localityName: string;
  distanceKm: number;
  distanceLabel: string;
  averageRating: number | null;
  reviewCount: number;
  categories: { id: string; name: string; slug: string }[];
  matchingServiceTitle: string | null;
}
