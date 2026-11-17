import type { ShopType } from '../shared/enums.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, assertValidTimezone } from '../lib/shopScope.js';
import { serializeShop } from './authService.js';

export interface UpdateShopInput {
  name?: string;
  type?: ShopType;
  currency?: string;
  timezone?: string;
  address?: string | null;
  phone?: string | null;
}

/**
 * Returns the shop owned by req.auth.shopId (BR-A4, BR-A5).
 */
export async function getShopById(shopId: string) {
  const prisma = await ensurePrismaConnected();
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });
  return serializeShop(assertFoundInShop(shop, 'Shop'));
}

/**
 * Updates mutable shop settings for req.auth.shopId (BR-A6).
 */
export async function updateShopById(shopId: string, input: UpdateShopInput) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.shop.findUnique({
    where: { id: shopId },
  });
  assertFoundInShop(existing, 'Shop');

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.type !== undefined) data.type = input.type;
  if (input.currency !== undefined) data.currency = input.currency.trim().toUpperCase();
  if (input.timezone !== undefined) data.timezone = assertValidTimezone(input.timezone);
  if (input.address !== undefined) data.address = input.address === null ? null : input.address.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone === null ? null : input.phone.trim() || null;

  const updated = await prisma.shop.update({
    where: { id: shopId },
    data,
  });

  return serializeShop(updated);
}
