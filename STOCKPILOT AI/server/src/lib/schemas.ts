import { z } from 'zod';

export const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal string');

export const nonNegativeDecimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Must be a non-negative decimal string');

export const positiveDecimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal string')
  .refine((v) => parseFloat(v) > 0, 'Must be greater than zero');

export const booleanQueryFlagSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const baseListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional(),
  })
  .strict();
