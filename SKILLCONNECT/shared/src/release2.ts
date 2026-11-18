import { z } from "zod";

// R2-1: AI Service Request Understanding
export const aiUnderstandRequestSchema = z
  .object({
    problemText: z.string().trim().min(5).max(500),
  })
  .strict();

export type AiUnderstandRequestInput = z.infer<
  typeof aiUnderstandRequestSchema
>;

export const aiUnderstandOutputSchema = z.object({
  suggestedCategorySlug: z.string().nullable(),
  suggestedCategoryName: z.string().nullable(),
  searchKeywords: z.array(z.string().max(50)).max(5),
  missingDetailsPrompts: z.array(z.string().max(150)).max(4),
  uncertaintyNote: z.string().max(200),
  fallbackUsed: z.boolean().default(false),
});

export type AiUnderstandOutputDto = z.infer<typeof aiUnderstandOutputSchema>;

// R2-2: AI Offer Structuring (OFR-2 aligned; never invents missing fields)
export const aiStructureOfferSchema = z
  .object({
    rawText: z.string().trim().min(5).max(1000),
  })
  .strict();

export type AiStructureOfferInput = z.infer<typeof aiStructureOfferSchema>;

export const aiStructureOfferOutputSchema = z.object({
  serviceName: z.string().trim().min(2).max(100).nullable(),
  description: z.string().trim().min(10).max(1000).nullable(),
  pricePkr: z.number().int().min(1).max(10_000_000).nullable(),
  proposedStartIso: z.string().datetime({ offset: true }).nullable(),
  terms: z.string().trim().max(1000).nullable(),
});

export type AiStructureOfferOutputDto = z.infer<
  typeof aiStructureOfferOutputSchema
>;

// R2-3: AI Chat Assistance (explicit user action only, never automatic)
export const aiChatAssistSchema = z
  .object({
    action: z.enum([
      "summarize",
      "missing_info",
      "clarify",
      "simplify",
      "translate",
    ]),
    targetLanguage: z.enum(["English", "Urdu", "Pashto"]).optional(),
    messageText: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export type AiChatAssistInput = z.infer<typeof aiChatAssistSchema>;

export const aiChatAssistOutputSchema = z.object({
  action: z.string(),
  resultText: z.string().max(1200),
  bulletPoints: z.array(z.string().max(200)).max(6),
});

export type AiChatAssistOutputDto = z.infer<typeof aiChatAssistOutputSchema>;

// R2-4: Place Search (Places API New)
export const placeAutocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const placeDetailsQuerySchema = z.object({
  placeId: z.string().trim().min(3).max(200),
});

export interface PlaceSuggestionDto {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetailsDto {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

// R2-5: Travel Estimates (Routes API)
export const travelEstimateQuerySchema = z.object({
  providerProfileId: z.string().uuid(),
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
});

export interface TravelEstimateDto {
  distanceMeters: number;
  distanceLabel: string;
  durationSeconds: number;
  durationLabel: string;
}
