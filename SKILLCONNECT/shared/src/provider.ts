import { z } from "zod";
import { PROVIDER_STATUSES, type ProviderStatus } from "./index.js";

const normalizeText = (val: string) => val.trim().normalize("NFC");

export const VERIFICATION_DECISIONS = [
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "REINSTATED",
] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

export const timeHHMMRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const providerProfileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(2).max(60))
      .optional(),
    photoUrl: z.string().url().max(500).optional(),
    photoFileId: z.string().min(1).max(200).optional(),
    description: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(30).max(1000))
      .optional(),
    experienceYears: z.number().int().min(0).max(60).optional(),
    isAcceptingWork: z.boolean().optional(),
  })
  .strict();

export const providerServicesUpdateSchema = z
  .object({
    services: z
      .array(
        z
          .object({
            categoryId: z.string().uuid(),
            title: z
              .string()
              .transform(normalizeText)
              .pipe(z.string().min(2).max(100)),
            description: z
              .string()
              .transform(normalizeText)
              .pipe(z.string().min(10).max(500)),
          })
          .strict()
      )
      .min(1)
      .max(20),
  })
  .strict();

export const serviceAreaUpdateSchema = z
  .object({
    localityId: z.string().uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusKm: z.number().int().min(1).max(30),
  })
  .strict();

export const availabilityWindowInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: z.string().regex(timeHHMMRegex, "Use HH:MM 24h format"),
    endTime: z.string().regex(timeHHMMRegex, "Use HH:MM 24h format"),
  })
  .strict()
  .refine((w) => w.startTime < w.endTime, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });

export const availabilityUpdateSchema = z
  .object({
    windows: z.array(availabilityWindowInputSchema).max(35),
  })
  .strict();

export const portfolioCreateSchema = z
  .object({
    imageUrl: z.string().url().max(500),
    fileId: z.string().min(1).max(200),
    caption: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().max(200))
      .optional(),
    sortOrder: z.number().int().min(0).max(100).default(0),
  })
  .strict();

export const providerAdminDecisionSchema = z
  .object({
    decision: z.enum(VERIFICATION_DECISIONS),
    reason: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(10).max(500))
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.decision !== "REJECTED" || (data.reason && data.reason.length >= 10),
    {
      message: "Rejection requires a reason of at least 10 characters",
      path: ["reason"],
    }
  );

export const adminProvidersQuerySchema = z.object({
  status: z.enum(PROVIDER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface ProviderServiceDto {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  description: string;
}

export interface AvailabilityWindowDto {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface PortfolioMediaDto {
  id: string;
  imageUrl: string;
  fileId: string;
  caption: string | null;
  sortOrder: number;
}

export interface ProviderVerificationDto {
  id: string;
  decision: VerificationDecision;
  reason: string | null;
  createdAt: string;
}

export interface PublicServiceAreaDto {
  localityId: string;
  localityName: string;
  radiusKm: number;
}

export interface OwnServiceAreaDto extends PublicServiceAreaDto {
  lat: number;
  lng: number;
}

export interface PublicProviderProfileDto {
  id: string;
  userId: string;
  displayName: string;
  photoUrl: string | null;
  description: string | null;
  experienceYears: number | null;
  status: ProviderStatus;
  isAcceptingWork: boolean;
  services: ProviderServiceDto[];
  serviceArea: PublicServiceAreaDto | null;
  availability: AvailabilityWindowDto[];
  portfolio: PortfolioMediaDto[];
  averageRating: number | null;
  reviewCount: number;
}

export interface OwnProviderProfileDto
  extends Omit<PublicProviderProfileDto, "serviceArea"> {
  submittedAt: string | null;
  serviceArea: OwnServiceAreaDto | null;
  verifications: ProviderVerificationDto[];
}
