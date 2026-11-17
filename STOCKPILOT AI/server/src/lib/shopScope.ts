import type { Request } from 'express';
import { badRequest, notFound, unauthorized } from './errors.js';

/**
 * Extracts verified shopId exclusively from req.auth (JWT claim), never from
 * request body, query parameters, or route params (BR-A4).
 */
export function getShopId(req: Request): string {
  const shopId = req.auth?.shopId;
  if (!shopId) {
    throw unauthorized('Authentication required');
  }
  return shopId;
}

/**
 * Forces every Prisma where-clause to include shopId from JWT (BR-A4, BR-A5).
 */
export function scopeWhere<T extends Record<string, unknown>>(
  shopId: string,
  where?: T,
): T & { shopId: string } {
  return {
    ...(where ?? ({} as T)),
    shopId,
  };
}

/**
 * Uniform 404 helper when a record does not exist OR belongs to another shop (BR-A5).
 */
export function assertFoundInShop<T>(record: T | null | undefined, entityName = 'Record'): T {
  if (!record) {
    throw notFound(`${entityName} not found`);
  }
  return record;
}

/**
 * Validates an IANA timezone string using Intl.DateTimeFormat (BR-G3, BR-A6).
 */
export function assertValidTimezone(timezone: string, field = 'timezone'): string {
  const trimmed = timezone.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    throw badRequest(`Invalid timezone: ${trimmed}`, [
      { field, message: 'Must be a valid IANA timezone (e.g. Asia/Karachi)' },
    ]);
  }
}
