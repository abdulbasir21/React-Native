import type { Prisma } from '@prisma/client';
import { badRequest, conflict } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import type { StockMovementType, Unit } from '../shared/enums.js';
import {
  cmpDecimal,
  dec,
  formatQuantity,
  round2,
  round4,
  validateQuantityForUnit,
} from '../shared/money.js';

export interface ApplyStockMovementInput {
  id?: string;
  productId: string;
  type: StockMovementType;
  quantityChange: string;
  reason?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  saleReturnId?: string | null;
  occurredAt?: Date;
  nextAverageCost?: string;
  nextLastPurchaseCost?: string;
  allowNegativeStock?: boolean;
  requireActiveProduct?: boolean;
}

export interface SerializedStockMovement {
  id: string;
  shopId: string;
  productId: string;
  productName?: string;
  productUnit?: Unit;
  type: StockMovementType;
  quantityChange: string;
  previousQty: string;
  newQty: string;
  saleId: string | null;
  purchaseId: string | null;
  saleReturnId: string | null;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

const POSITIVE_ONLY_TYPES = new Set<StockMovementType>([
  'INITIAL_STOCK',
  'PURCHASE',
  'CUSTOMER_RETURN',
  'SALE_CANCELLATION',
]);

const NEGATIVE_ONLY_TYPES = new Set<StockMovementType>(['SALE', 'DAMAGED', 'EXPIRED']);

const REASON_REQUIRED_TYPES = new Set<StockMovementType>(['DAMAGED', 'EXPIRED', 'ADJUSTMENT']);

export function serializeMovement(m: {
  id: string;
  shopId: string;
  productId: string;
  type: string;
  quantityChange: { toString(): string };
  previousQty: { toString(): string };
  newQty: { toString(): string };
  saleId: string | null;
  purchaseId: string | null;
  saleReturnId: string | null;
  reason: string | null;
  occurredAt: Date;
  createdAt: Date;
  product?: { name: string; unit: string };
}): SerializedStockMovement {
  return {
    id: m.id,
    shopId: m.shopId,
    productId: m.productId,
    ...(m.product ? { productName: m.product.name, productUnit: m.product.unit as Unit } : {}),
    type: m.type as StockMovementType,
    quantityChange: formatQuantity(m.quantityChange.toString()),
    previousQty: formatQuantity(m.previousQty.toString()),
    newQty: formatQuantity(m.newQty.toString()),
    saleId: m.saleId,
    purchaseId: m.purchaseId,
    saleReturnId: m.saleReturnId,
    reason: m.reason,
    occurredAt: m.occurredAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * BR-S1, BR-S2, BR-S3, BR-S6, BR-P5, BR-C5:
 * Single inventory mutation function. Locks the product row FOR UPDATE,
 * updates Product.quantityOnHand, and inserts exactly one StockMovement in the same tx.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  shopId: string,
  input: ApplyStockMovementInput,
) {
  const lockedRows = await tx.$queryRaw<
    Array<{
      id: string;
      name: string;
      quantityOnHand: string;
      unit: string;
      averageCost: string;
      archivedAt: Date | null;
    }>
  >`
    SELECT id, name, "quantityOnHand"::text AS "quantityOnHand", unit::text AS unit,
           "averageCost"::text AS "averageCost", "archivedAt"
    FROM products
    WHERE id = ${input.productId}::uuid AND "shopId" = ${shopId}::uuid
    FOR UPDATE
  `;

  const product = assertFoundInShop(lockedRows[0], 'Product');

  if (input.requireActiveProduct && product.archivedAt !== null) {
    throw conflict('PRODUCT_ARCHIVED', `Product "${product.name}" is archived and cannot be used`);
  }

  let qtyDec;
  try {
    qtyDec = dec(input.quantityChange);
  } catch {
    throw badRequest('Invalid quantityChange value', [{ field: 'quantityChange' }]);
  }

  if (qtyDec.eq(0)) {
    throw badRequest('quantityChange cannot be zero', [
      { field: 'quantityChange', message: 'Quantity change must be non-zero' },
    ]);
  }

  if (POSITIVE_ONLY_TYPES.has(input.type) && qtyDec.lte(0)) {
    throw badRequest(`${input.type} movement requires a positive quantityChange`, [
      { field: 'quantityChange', message: `${input.type} must be positive` },
    ]);
  }

  if (NEGATIVE_ONLY_TYPES.has(input.type) && qtyDec.gte(0)) {
    throw badRequest(`${input.type} movement requires a negative quantityChange`, [
      { field: 'quantityChange', message: `${input.type} must be negative` },
    ]);
  }

  const unitCheck = validateQuantityForUnit(qtyDec.abs(), product.unit as Unit);
  if (!unitCheck.valid) {
    throw badRequest(unitCheck.reason ?? 'Invalid quantity precision for unit', [
      { field: 'quantityChange', message: unitCheck.reason },
    ]);
  }

  const normalizedReason = input.reason?.trim() || null;
  if (REASON_REQUIRED_TYPES.has(input.type) && !normalizedReason) {
    throw badRequest(`Reason is required for ${input.type} stock movements`, [
      { field: 'reason', message: 'Reason is required' },
    ]);
  }

  const previousQtyStr = formatQuantity(product.quantityOnHand);
  const newQtyDec = dec(previousQtyStr).plus(qtyDec);
  const newQtyStr = formatQuantity(newQtyDec);

  if (!input.allowNegativeStock && newQtyDec.lt(0)) {
    throw conflict(
      'INSUFFICIENT_STOCK',
      `Insufficient stock for ${product.name} (available ${previousQtyStr})`,
      [{ field: 'quantityChange' }],
    );
  }

  const updateData: Prisma.ProductUpdateInput = {
    quantityOnHand: newQtyStr,
  };

  // BR-C5: DAMAGED, EXPIRED, ADJUSTMENT (and SALE) never pass nextAverageCost.
  if (input.nextAverageCost !== undefined) {
    updateData.averageCost = round4(input.nextAverageCost);
  }
  if (input.nextLastPurchaseCost !== undefined) {
    updateData.lastPurchaseCost = round2(input.nextLastPurchaseCost);
  }

  await tx.product.update({
    where: { id: product.id },
    data: updateData,
  });

  const movement = await tx.stockMovement.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      shopId,
      productId: product.id,
      type: input.type,
      quantityChange: formatQuantity(qtyDec),
      previousQty: previousQtyStr,
      newQty: newQtyStr,
      saleId: input.saleId ?? null,
      purchaseId: input.purchaseId ?? null,
      saleReturnId: input.saleReturnId ?? null,
      reason: normalizedReason,
      occurredAt: input.occurredAt ?? new Date(),
    },
    include: {
      product: { select: { name: true, unit: true } },
    },
  });

  return {
    movement: serializeMovement(movement),
    previousQty: previousQtyStr,
    newQty: newQtyStr,
    unit: product.unit as Unit,
    productName: product.name,
    previousAverageCost: round4(product.averageCost),
  };
}

export async function adjustProductStock(
  shopId: string,
  productId: string,
  input: {
    id?: string;
    type: 'ADJUSTMENT' | 'DAMAGED' | 'EXPIRED';
    quantityChange: string;
    reason: string;
    occurredAt?: string;
  },
) {
  const prisma = await ensurePrismaConnected();
  return prisma.$transaction(async (tx) => {
    const result = await applyStockMovement(tx, shopId, {
      id: input.id,
      productId,
      type: input.type,
      quantityChange: input.quantityChange,
      reason: input.reason,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      allowNegativeStock: false,
    });
    return result.movement;
  });
}

export async function listProductMovements(
  shopId: string,
  productId: string,
  options: { page: number; pageSize: number },
) {
  const prisma = await ensurePrismaConnected();
  const product = await prisma.product.findFirst({
    where: scopeWhere(shopId, { id: productId }),
    select: { id: true },
  });
  assertFoundInShop(product, 'Product');

  const where = scopeWhere(shopId, { productId });
  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { name: true, unit: true } } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    items: rows.map(serializeMovement),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

export async function listStockMovements(
  shopId: string,
  options: { page: number; pageSize: number; productId?: string; type?: StockMovementType },
) {
  const prisma = await ensurePrismaConnected();
  const where = scopeWhere(shopId, {
    ...(options.productId ? { productId: options.productId } : {}),
    ...(options.type ? { type: options.type } : {}),
  });

  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: { product: { select: { name: true, unit: true } } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    items: rows.map(serializeMovement),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

/**
 * BR-S4: Verifies every product's quantityOnHand equals the exact sum of its movements.
 */
export async function reconcileShopStock(shopId: string) {
  const prisma = await ensurePrismaConnected();
  const rows = await prisma.$queryRaw<
    Array<{
      productId: string;
      name: string;
      quantityOnHand: string;
      movementSum: string;
    }>
  >`
    SELECT p.id AS "productId",
           p.name,
           p."quantityOnHand"::text AS "quantityOnHand",
           COALESCE(SUM(m."quantityChange"), 0)::text AS "movementSum"
    FROM products p
    LEFT JOIN stock_movements m
      ON m."productId" = p.id AND m."shopId" = p."shopId"
    WHERE p."shopId" = ${shopId}::uuid
    GROUP BY p.id, p.name, p."quantityOnHand"
    ORDER BY p.name ASC
  `;

  const mismatches = rows
    .filter((r) => cmpDecimal(r.quantityOnHand, r.movementSum) !== 0)
    .map((r) => ({
      productId: r.productId,
      name: r.name,
      quantityOnHand: formatQuantity(r.quantityOnHand),
      movementSum: formatQuantity(r.movementSum),
    }));

  return {
    balanced: mismatches.length === 0,
    checkedCount: rows.length,
    mismatches,
  };
}
