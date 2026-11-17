import { Prisma } from '@prisma/client';
import { badRequest, conflict } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import type { Unit } from '../shared/enums.js';
import {
  cmpDecimal,
  dec,
  formatMoney,
  formatQuantity,
  round2,
  round4,
  validateQuantityForUnit,
} from '../shared/money.js';
import { clearShopAiCache } from './aiCache.js';
import { applyStockMovement } from './inventoryService.js';

export function serializeProduct(p: {
  id: string;
  shopId: string;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string;
  purchaseCost: { toString(): string };
  lastPurchaseCost: { toString(): string };
  sellingPrice: { toString(): string };
  quantityOnHand: { toString(): string };
  averageCost: { toString(): string };
  minStockLevel: { toString(): string };
  imageUri: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const quantityOnHand = formatQuantity(p.quantityOnHand.toString());
  const minStockLevel = formatQuantity(p.minStockLevel.toString());
  // BR-P6: calculated, not stored
  const isLowStock =
    p.archivedAt === null && cmpDecimal(quantityOnHand, minStockLevel) <= 0;

  return {
    id: p.id,
    shopId: p.shopId,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    name: p.name,
    sku: p.sku,
    description: p.description,
    unit: p.unit as Unit,
    purchaseCost: formatMoney(p.purchaseCost.toString()),
    lastPurchaseCost: formatMoney(p.lastPurchaseCost.toString()),
    sellingPrice: formatMoney(p.sellingPrice.toString()),
    quantityOnHand,
    averageCost: round4(p.averageCost.toString()),
    minStockLevel,
    isLowStock,
    imageUri: p.imageUri,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function validateNonNegativeMoney(value: string, field: string): string {
  let d;
  try {
    d = dec(value);
  } catch {
    throw badRequest(`Invalid ${field}`, [{ field }]);
  }
  if (d.lt(0)) {
    throw badRequest(`${field} must be >= 0`, [{ field }]);
  }
  return round2(d);
}

function validateUnitQty(value: string, unit: Unit, field: string): string {
  const check = validateQuantityForUnit(value, unit, true);
  if (!check.valid) {
    throw badRequest(check.reason ?? `Invalid ${field} for unit ${unit}`, [
      { field, message: check.reason },
    ]);
  }
  const d = dec(value);
  if (d.lt(0)) {
    throw badRequest(`${field} must be >= 0`, [{ field }]);
  }
  return formatQuantity(d);
}

export async function listProducts(
  shopId: string,
  options: {
    page: number;
    pageSize: number;
    search?: string;
    categoryId?: string;
    includeArchived?: boolean;
    lowStockOnly?: boolean;
  },
) {
  const prisma = await ensurePrismaConnected();
  const search = options.search?.trim();
  const where: Prisma.ProductWhereInput = scopeWhere(shopId, {
    ...(options.includeArchived ? {} : { archivedAt: null }),
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  });

  if (options.lowStockOnly) {
    const allRows = await prisma.product.findMany({
      where: { ...where, archivedAt: null },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    const lowStockItems = allRows
      .map(serializeProduct)
      .filter((p) => p.isLowStock);
    const start = (options.page - 1) * options.pageSize;
    return {
      items: lowStockItems.slice(start, start + options.pageSize),
      meta: {
        page: options.page,
        pageSize: options.pageSize,
        total: lowStockItems.length,
      },
    };
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    items: rows.map(serializeProduct),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

export async function getProductById(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const product = await prisma.product.findFirst({
    where: scopeWhere(shopId, { id }),
    include: { category: { select: { id: true, name: true } } },
  });
  return serializeProduct(assertFoundInShop(product, 'Product'));
}

export async function createProduct(
  shopId: string,
  input: {
    id?: string;
    categoryId?: string | null;
    name: string;
    sku?: string | null;
    description?: string | null;
    unit: Unit;
    purchaseCost: string;
    sellingPrice: string;
    initialQuantity?: string;
    minStockLevel?: string;
    imageUri?: string | null;
  },
) {
  const prisma = await ensurePrismaConnected();

  if (input.categoryId) {
    const cat = await prisma.category.findFirst({
      where: scopeWhere(shopId, { id: input.categoryId }),
      select: { id: true },
    });
    assertFoundInShop(cat, 'Category');
  }

  const purchaseCost = validateNonNegativeMoney(input.purchaseCost, 'purchaseCost');
  const sellingPrice = validateNonNegativeMoney(input.sellingPrice, 'sellingPrice');
  const averageCost = round4(purchaseCost);
  const minStockLevel = validateUnitQty(input.minStockLevel ?? '0', input.unit, 'minStockLevel');
  const initialQty = validateUnitQty(input.initialQuantity ?? '0', input.unit, 'initialQuantity');
  const sku = input.sku?.trim() || null;

  if (sku) {
    const dupSku = await prisma.product.findFirst({
      where: scopeWhere(shopId, { sku: { equals: sku, mode: 'insensitive' as const } }),
      select: { id: true },
    });
    if (dupSku) {
      throw conflict('DUPLICATE_SKU', `SKU "${sku}" is already in use in this shop`, [
        { field: 'sku' },
      ]);
    }
  }

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      // BR-P3: create Product with quantityOnHand = 0, then call applyStockMovement if initialQty > 0
      const created = await tx.product.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          shopId,
          categoryId: input.categoryId ?? null,
          name: input.name.trim(),
          sku,
          description: input.description?.trim() || null,
          unit: input.unit,
          purchaseCost,
          lastPurchaseCost: purchaseCost,
          sellingPrice,
          quantityOnHand: '0.000',
          averageCost,
          minStockLevel,
          imageUri: input.imageUri?.trim() || null,
        },
      });

      if (cmpDecimal(initialQty, 0) > 0) {
        await applyStockMovement(tx, shopId, {
          productId: created.id,
          type: 'INITIAL_STOCK',
          quantityChange: initialQty,
          reason: 'Initial stock on product creation',
        });
      }

      return created.id;
    });

    clearShopAiCache(shopId);
    return getProductById(shopId, createdId);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('DUPLICATE_SKU', `SKU "${sku}" is already in use in this shop`, [
        { field: 'sku' },
      ]);
    }
    throw err;
  }
}

export async function updateProduct(
  shopId: string,
  id: string,
  input: {
    categoryId?: string | null;
    name?: string;
    sku?: string | null;
    description?: string | null;
    unit?: Unit;
    purchaseCost?: string;
    sellingPrice?: string;
    minStockLevel?: string;
    imageUri?: string | null;
  },
) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.product.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  const current = assertFoundInShop(existing, 'Product');

  if (input.categoryId !== undefined && input.categoryId !== null) {
    const cat = await prisma.category.findFirst({
      where: scopeWhere(shopId, { id: input.categoryId }),
      select: { id: true },
    });
    assertFoundInShop(cat, 'Category');
  }

  const effectiveUnit = (input.unit ?? current.unit) as Unit;
  const data: Prisma.ProductUncheckedUpdateInput = {};

  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) {
    data.description = input.description === null ? null : input.description.trim() || null;
  }
  if (input.imageUri !== undefined) {
    data.imageUri = input.imageUri === null ? null : input.imageUri.trim() || null;
  }
  if (input.unit !== undefined) data.unit = input.unit;
  if (input.purchaseCost !== undefined) {
    data.purchaseCost = validateNonNegativeMoney(input.purchaseCost, 'purchaseCost');
  }
  if (input.sellingPrice !== undefined) {
    data.sellingPrice = validateNonNegativeMoney(input.sellingPrice, 'sellingPrice');
  }
  if (input.minStockLevel !== undefined) {
    data.minStockLevel = validateUnitQty(input.minStockLevel, effectiveUnit, 'minStockLevel');
  }

  if (input.sku !== undefined) {
    const normalizedSku = input.sku === null ? null : input.sku.trim() || null;
    if (normalizedSku) {
      const dupSku = await prisma.product.findFirst({
        where: scopeWhere(shopId, {
          sku: { equals: normalizedSku, mode: 'insensitive' as const },
          id: { not: id },
        }),
        select: { id: true },
      });
      if (dupSku) {
        throw conflict('DUPLICATE_SKU', `SKU "${normalizedSku}" is already in use in this shop`, [
          { field: 'sku' },
        ]);
      }
    }
    data.sku = normalizedSku;
  }

  // BR-P2: never touch quantityOnHand or averageCost in updateProduct
  const updated = await prisma.product.update({
    where: { id },
    data,
    include: { category: { select: { id: true, name: true } } },
  });
  return serializeProduct(updated);
}

export async function archiveProduct(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const existing = await prisma.product.findFirst({
    where: scopeWhere(shopId, { id }),
  });
  assertFoundInShop(existing, 'Product');

  const updated = await prisma.product.update({
    where: { id },
    data: { archivedAt: existing!.archivedAt ?? new Date() },
    include: { category: { select: { id: true, name: true } } },
  });
  return serializeProduct(updated);
}
