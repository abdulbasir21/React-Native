import { z } from "zod";

export const LOCALITY_LEVELS = ["PROVINCE", "DISTRICT", "LOCALITY"] as const;
export type LocalityLevel = (typeof LOCALITY_LEVELS)[number];

const normalizeText = (val: string) => val.trim().normalize("NFC");
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categoryCreateSchema = z
  .object({
    name: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(2).max(80)),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugRegex, "Slug must contain lowercase letters, numbers, and hyphens only")
      .max(80),
    iconKey: z.string().trim().min(1).max(60),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    name: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(2).max(80))
      .optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugRegex, "Slug must contain lowercase letters, numbers, and hyphens only")
      .max(80)
      .optional(),
    iconKey: z.string().trim().min(1).max(60).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

export const localityCreateSchema = z
  .object({
    name: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(2).max(100)),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugRegex, "Slug must contain lowercase letters, numbers, and hyphens only")
      .max(100),
    level: z.enum(LOCALITY_LEVELS),
    parentId: z.string().uuid().nullable().default(null),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    isServiceable: z.boolean().default(true),
  })
  .strict();

export const localityUpdateSchema = z
  .object({
    name: z
      .string()
      .transform(normalizeText)
      .pipe(z.string().min(2).max(100))
      .optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugRegex, "Slug must contain lowercase letters, numbers, and hyphens only")
      .max(100)
      .optional(),
    level: z.enum(LOCALITY_LEVELS).optional(),
    parentId: z.string().uuid().nullable().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    isServiceable: z.boolean().optional(),
  })
  .strict();

export const locationCheckQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  iconKey: string;
  isActive: boolean;
  sortOrder: number;
}

export interface LocalityDto {
  id: string;
  parentId: string | null;
  level: LocalityLevel;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  isServiceable: boolean;
}

export interface LocationCheckDto {
  outsideServiceArea: boolean;
  radiusKm: number;
  nearestLocality: LocalityDto | null;
}

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type LocalityCreateInput = z.infer<typeof localityCreateSchema>;
export type LocalityUpdateInput = z.infer<typeof localityUpdateSchema>;

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const localityBulkSchema = z
  .object({
    localities: z
      .array(
        z
          .object({
            name: z.string().transform(normalizeText).pipe(z.string().min(2).max(100)),
            slug: z.string().trim().toLowerCase().regex(slugRegex).max(100),
            level: z.enum(LOCALITY_LEVELS),
            parentId: z.string().uuid().nullable().default(null),
            parentSlug: z.string().trim().toLowerCase().nullable().optional(),
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            isServiceable: z.boolean().default(true),
          })
          .strict()
      )
      .min(1)
      .max(500),
  })
  .strict();
