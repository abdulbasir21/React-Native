import { Prisma } from '@prisma/client';
import { badRequest, conflict, unprocessable } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import {
  NON_CREDIT_PAYMENT_METHODS,
  type NonCreditPaymentMethod,
  type PaymentDirection,
  type PaymentKind,
  type PaymentMethod,
  type Unit,
} from '../shared/enums.js';
import {
  allocateOldestFirst,
  customDateRangeBounds,
  derivePurchaseFinancials,
  lineSubtotal,
  periodBounds,
  type ReportPeriod,
  weightedAverage,
} from '../shared/calculations.js';
import {
  dec,
  formatMoney,
  formatQuantity,
  round2,
  round4,
  sumMoney,
  validateQuantityForUnit,
} from '../shared/money.js';
import { applyStockMovement } from './inventoryService.js';

export function serializePayment(p: {
  id: string;
  shopId: string;
  kind: string;
  direction: string;
  method: string;
  amount: { toString(): string };
  paidAt: Date;
  saleId: string | null;
  purchaseId: string | null;
  note: string | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    shopId: p.shopId,
    kind: p.kind as PaymentKind,
    direction: p.direction as PaymentDirection,
    method: p.method as PaymentMethod,
    amount: formatMoney(p.amount.toString()),
    paidAt: p.paidAt.toISOString(),
    saleId: p.saleId,
    purchaseId: p.purchaseId,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializePurchase(p: {
  id: string;
  shopId: string;
  supplierId: string;
  supplier?: { id: string; name: string; phone: string | null; archivedAt: Date | null } | null;
  total: { toString(): string };
  idempotencyKey: string;
  occurredAt: Date;
  note: string | null;
  createdAt: Date;
  items?: Array<{
    id: string;
    purchaseId: string;
    productId: string;
    productNameSnapshot: string;
    quantity: { toString(): string };
    unitCost: { toString(): string };
    lineTotal: { toString(): string };
    createdAt: Date;
  }>;
  payments: Array<{
    id: string;
    shopId: string;
    kind: string;
    direction: string;
    method: string;
    amount: { toString(): string };
    paidAt: Date;
    saleId: string | null;
    purchaseId: string | null;
    note: string | null;
    createdAt: Date;
  }>;
}) {
  const totalStr = formatMoney(p.total.toString());
  const fin = derivePurchaseFinancials({
    total: totalStr,
    payments: p.payments.map((pay) => ({ amount: pay.amount.toString() })),
  });

  return {
    id: p.id,
    shopId: p.shopId,
    supplierId: p.supplierId,
    ...(p.supplier ? { supplierName: p.supplier.name } : {}),
    total: totalStr,
    amountPaid: fin.amountPaid,
    balanceDue: fin.balanceDue,
    paymentStatus: fin.paymentStatus,
    idempotencyKey: p.idempotencyKey,
    occurredAt: p.occurredAt.toISOString(),
    note: p.note,
    createdAt: p.createdAt.toISOString(),
    ...(p.items
      ? {
          items: p.items.map((item) => ({
            id: item.id,
            purchaseId: item.purchaseId,
            productId: item.productId,
            productNameSnapshot: item.productNameSnapshot,
            quantity: formatQuantity(item.quantity.toString()),
            unitCost: formatMoney(item.unitCost.toString()),
            lineTotal: formatMoney(item.lineTotal.toString()),
            createdAt: item.createdAt.toISOString(),
          })),
        }
      : {}),
    payments: p.payments.map(serializePayment),
  };
}

function assertNonCreditMethod(method: string | undefined, field = 'paymentMethod'): NonCreditPaymentMethod {
  if (!method || !NON_CREDIT_PAYMENT_METHODS.includes(method as NonCreditPaymentMethod)) {
    throw badRequest('A non-credit payment method is required', [{ field }]);
  }
  return method as NonCreditPaymentMethod;
}

const purchaseInclude = {
  supplier: { select: { id: true, name: true, phone: true, archivedAt: true } },
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { paidAt: 'asc' as const } },
};

export async function getPurchaseById(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const row = await prisma.purchase.findFirst({
    where: scopeWhere(shopId, { id }),
    include: purchaseInclude,
  });
  return serializePurchase(assertFoundInShop(row, 'Purchase'));
}

export async function listPurchases(
  shopId: string,
  options: {
    page: number;
    pageSize: number;
    supplierId?: string;
    search?: string;
    period?: ReportPeriod;
    from?: string;
    to?: string;
  },
) {
  const prisma = await ensurePrismaConnected();
  const shop = await prisma.shop.findUniqueOrThrow({
    where: { id: shopId },
    select: { timezone: true },
  });

  let dateFilter: Prisma.DateTimeFilter | undefined;
  if (options.period) {
    const bounds = periodBounds(options.period, shop.timezone);
    dateFilter = { gte: bounds.startUtc, lt: bounds.endUtc };
  } else if (options.from && options.to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(options.from) && /^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
      const bounds = customDateRangeBounds(options.from, options.to, shop.timezone);
      dateFilter = { gte: bounds.startUtc, lt: bounds.endUtc };
    } else {
      dateFilter = { gte: new Date(options.from), lte: new Date(options.to) };
    }
  }

  const search = options.search?.trim();
  const where: Prisma.PurchaseWhereInput = scopeWhere(shopId, {
    ...(options.supplierId ? { supplierId: options.supplierId } : {}),
    ...(dateFilter ? { occurredAt: dateFilter } : {}),
    ...(search
      ? {
          OR: [
            { supplier: { name: { contains: search, mode: 'insensitive' as const } } },
            { note: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  });

  const [total, rows] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      include: purchaseInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    items: rows.map(serializePurchase),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

export interface CreatePurchaseLineInput {
  id?: string;
  movementId?: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

export interface CreatePurchaseInput {
  id?: string;
  supplierId: string;
  idempotencyKey: string;
  occurredAt?: string;
  note?: string | null;
  amountPaid?: string;
  paymentMethod?: string;
  paymentId?: string;
  items: CreatePurchaseLineInput[];
}

export async function createPurchase(shopId: string, input: CreatePurchaseInput) {
  const prisma = await ensurePrismaConnected();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw badRequest('Idempotency-Key is required', [{ field: 'idempotencyKey' }]);
  }

  // BR-PU8: idempotent replay before touching stock or creating rows
  const existingReplay = await prisma.purchase.findUnique({
    where: { shopId_idempotencyKey: { shopId, idempotencyKey } },
    include: purchaseInclude,
  });
  if (existingReplay) {
    return { purchase: serializePurchase(existingReplay), idempotentReplay: true };
  }

  if (input.items.length < 1 || input.items.length > 200) {
    throw badRequest('A purchase must have between 1 and 200 items', [{ field: 'items' }]);
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw badRequest('Invalid occurredAt timestamp', [{ field: 'occurredAt' }]);
  }

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      // BR-PU2, BR-SU1: non-archived supplier belonging to this shop required
      const supplier = await tx.supplier.findFirst({
        where: scopeWhere(shopId, { id: input.supplierId }),
      });
      const verifiedSupplier = assertFoundInShop(supplier, 'Supplier');
      if (verifiedSupplier.archivedAt !== null) {
        throw conflict('SUPPLIER_ARCHIVED', 'Archived supplier cannot receive new purchases', [
          { field: 'supplierId' },
        ]);
      }

      // Deterministic sorted row locking for all products in purchase
      const uniqueProductIds = [...new Set(input.items.map((l) => l.productId))].sort();
      const lockedProducts = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          unit: string;
          quantityOnHand: string;
          averageCost: string;
          archivedAt: Date | null;
        }>
      >`
        SELECT id, name, unit::text AS unit, "quantityOnHand"::text AS "quantityOnHand",
               "averageCost"::text AS "averageCost", "archivedAt"
        FROM products
        WHERE "shopId" = ${shopId}::uuid
          AND id IN (${Prisma.join(uniqueProductIds.map((pid) => Prisma.sql`${pid}::uuid`))})
        ORDER BY id ASC
        FOR UPDATE
      `;

      const productStateMap = new Map<
        string,
        {
          id: string;
          name: string;
          unit: Unit;
          quantityOnHand: string;
          averageCost: string;
          archivedAt: Date | null;
        }
      >();
      for (const row of lockedProducts) {
        productStateMap.set(row.id, {
          id: row.id,
          name: row.name,
          unit: row.unit as Unit,
          quantityOnHand: formatQuantity(row.quantityOnHand),
          averageCost: round4(row.averageCost),
          archivedAt: row.archivedAt,
        });
      }

      const validatedLines: Array<{
        id?: string;
        movementId?: string;
        productId: string;
        productName: string;
        quantity: string;
        unitCost: string;
        lineTotal: string;
      }> = [];

      for (let i = 0; i < input.items.length; i += 1) {
        const line = input.items[i]!;
        const state = productStateMap.get(line.productId);
        const verifiedProduct = assertFoundInShop(state, 'Product');

        // BR-P4: archived product cannot be purchased
        if (verifiedProduct.archivedAt !== null) {
          throw conflict(
            'PRODUCT_ARCHIVED',
            `Product "${verifiedProduct.name}" is archived and cannot be purchased`,
            [{ field: `items[${i}].productId` }],
          );
        }

        const unitCheck = validateQuantityForUnit(line.quantity, verifiedProduct.unit, false);
        if (!unitCheck.valid) {
          throw badRequest(unitCheck.reason ?? 'Invalid line quantity for product unit', [
            { field: `items[${i}].quantity`, message: unitCheck.reason },
          ]);
        }

        let unitCostDec;
        try {
          unitCostDec = dec(line.unitCost);
        } catch {
          throw badRequest('Invalid unitCost value', [{ field: `items[${i}].unitCost` }]);
        }
        if (unitCostDec.lt(0)) {
          throw badRequest('unitCost must be >= 0', [{ field: `items[${i}].unitCost` }]);
        }

        const qtyStr = formatQuantity(line.quantity);
        const costStr = round2(unitCostDec);
        const lTotal = lineSubtotal(qtyStr, costStr);

        validatedLines.push({
          id: line.id,
          movementId: line.movementId,
          productId: line.productId,
          productName: verifiedProduct.name,
          quantity: qtyStr,
          unitCost: costStr,
          lineTotal: lTotal,
        });
      }

      const total = sumMoney(validatedLines.map((l) => l.lineTotal));

      // BR-PU3: 0 <= amountPaid <= total, method not CREDIT if > 0
      const amountPaidRaw = input.amountPaid ?? '0.00';
      let amountPaidDec;
      try {
        amountPaidDec = dec(amountPaidRaw);
      } catch {
        throw badRequest('Invalid amountPaid', [{ field: 'amountPaid' }]);
      }
      if (amountPaidDec.lt(0)) {
        throw badRequest('amountPaid must be >= 0', [{ field: 'amountPaid' }]);
      }
      const amountPaid = round2(amountPaidDec);
      if (dec(amountPaid).gt(dec(total))) {
        throw unprocessable('PAYMENT_EXCEEDS_TOTAL', 'Amount paid cannot exceed purchase total', [
          { field: 'amountPaid' },
        ]);
      }

      let validMethod: NonCreditPaymentMethod | null = null;
      if (dec(amountPaid).gt(0)) {
        validMethod = assertNonCreditMethod(input.paymentMethod, 'paymentMethod');
      }

      const purchase = await tx.purchase.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          shopId,
          supplierId: verifiedSupplier.id,
          total,
          idempotencyKey,
          occurredAt,
          note: input.note?.trim() || null,
        },
      });

      if (validMethod && dec(amountPaid).gt(0)) {
        await tx.payment.create({
          data: {
            ...(input.paymentId ? { id: input.paymentId } : {}),
            shopId,
            kind: 'PURCHASE_PAYMENT',
            direction: 'OUT',
            method: validMethod,
            amount: amountPaid,
            paidAt: occurredAt,
            purchaseId: purchase.id,
            note: input.note?.trim() || null,
          },
        });
      }

      for (const line of validatedLines) {
        const currentState = productStateMap.get(line.productId)!;
        const nextAvgCost = weightedAverage(
          currentState.quantityOnHand,
          currentState.averageCost,
          line.quantity,
          line.unitCost,
        );

        await tx.purchaseItem.create({
          data: {
            ...(line.id ? { id: line.id } : {}),
            purchaseId: purchase.id,
            productId: line.productId,
            productNameSnapshot: line.productName,
            quantity: line.quantity,
            unitCost: line.unitCost,
            lineTotal: line.lineTotal,
          },
        });

        // BR-PU4, BR-C1, BR-C2, BR-C7, BR-S1
        const moveResult = await applyStockMovement(tx, shopId, {
          id: line.movementId,
          productId: line.productId,
          type: 'PURCHASE',
          quantityChange: line.quantity,
          purchaseId: purchase.id,
          occurredAt,
          nextAverageCost: nextAvgCost,
          nextLastPurchaseCost: line.unitCost,
          requireActiveProduct: true,
        });

        currentState.quantityOnHand = moveResult.newQty;
        currentState.averageCost = nextAvgCost;
      }

      return purchase.id;
    });

    const created = await getPurchaseById(shopId, createdId);
    return { purchase: created, idempotentReplay: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const replay = await prisma.purchase.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey } },
        include: purchaseInclude,
      });
      if (replay) {
        return { purchase: serializePurchase(replay), idempotentReplay: true };
      }
    }
    throw err;
  }
}

export async function getSupplierPayableMap(
  shopId: string,
  supplierIds?: string[],
): Promise<Map<string, string>> {
  const prisma = await ensurePrismaConnected();
  if (supplierIds && supplierIds.length === 0) {
    return new Map();
  }

  const purchases = await prisma.purchase.findMany({
    where: scopeWhere(shopId, supplierIds ? { supplierId: { in: supplierIds } } : {}),
    select: {
      id: true,
      supplierId: true,
      total: true,
      payments: {
        where: { kind: 'PURCHASE_PAYMENT' },
        select: { amount: true },
      },
    },
  });

  const totalsBySupplier = new Map<string, string[]>();
  for (const p of purchases) {
    const fin = derivePurchaseFinancials({
      total: p.total.toString(),
      payments: p.payments.map((pay) => ({ amount: pay.amount.toString() })),
    });
    const list = totalsBySupplier.get(p.supplierId) ?? [];
    list.push(fin.balanceDue);
    totalsBySupplier.set(p.supplierId, list);
  }

  const result = new Map<string, string>();
  for (const [sid, balances] of totalsBySupplier.entries()) {
    result.set(sid, sumMoney(balances));
  }
  return result;
}

export async function paySupplier(
  shopId: string,
  supplierId: string,
  input: {
    amount: string;
    method: string;
    paidAt?: string;
    note?: string | null;
    purchaseId?: string;
    paymentIds?: string[];
  },
) {
  const prisma = await ensurePrismaConnected();
  const validMethod = assertNonCreditMethod(input.method, 'method');

  let amountDec;
  try {
    amountDec = dec(input.amount);
  } catch {
    throw badRequest('Invalid payment amount', [{ field: 'amount' }]);
  }
  if (amountDec.lte(0)) {
    throw badRequest('Payment amount must be > 0', [{ field: 'amount' }]);
  }
  const paymentAmount = round2(amountDec);

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    throw badRequest('Invalid paidAt timestamp', [{ field: 'paidAt' }]);
  }

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: scopeWhere(shopId, { id: supplierId }),
      select: { id: true, name: true },
    });
    const verifiedSupplier = assertFoundInShop(supplier, 'Supplier');

    // Lock all supplier purchases in oldest-first order
    const lockedPurchases = await tx.$queryRaw<
      Array<{ id: string; total: string; occurredAt: Date }>
    >`
      SELECT id, total::text AS total, "occurredAt"
      FROM purchases
      WHERE "shopId" = ${shopId}::uuid AND "supplierId" = ${verifiedSupplier.id}::uuid
      ORDER BY "occurredAt" ASC, "createdAt" ASC, id ASC
      FOR UPDATE
    `;

    const purchaseIds = lockedPurchases.map((p) => p.id);
    const existingPayments =
      purchaseIds.length > 0
        ? await tx.payment.findMany({
            where: { shopId, purchaseId: { in: purchaseIds }, kind: 'PURCHASE_PAYMENT' },
            select: { purchaseId: true, amount: true },
          })
        : [];

    const paymentsByPurchase = new Map<string, Array<{ amount: string }>>();
    for (const pay of existingPayments) {
      if (!pay.purchaseId) continue;
      const arr = paymentsByPurchase.get(pay.purchaseId) ?? [];
      arr.push({ amount: pay.amount.toString() });
      paymentsByPurchase.set(pay.purchaseId, arr);
    }

    const targets = lockedPurchases.map((p) => {
      const fin = derivePurchaseFinancials({
        total: p.total,
        payments: paymentsByPurchase.get(p.id) ?? [],
      });
      return { id: p.id, balanceDue: fin.balanceDue };
    });

    let allocations;
    if (input.purchaseId) {
      const specific = targets.find((t) => t.id === input.purchaseId);
      const verifiedPurchase = assertFoundInShop(specific, 'Purchase');
      if (dec(paymentAmount).gt(dec(verifiedPurchase.balanceDue))) {
        throw unprocessable(
          'PAYMENT_EXCEEDS_BALANCE',
          `Payment (${paymentAmount}) exceeds purchase balance (${verifiedPurchase.balanceDue})`,
          [{ field: 'amount' }],
        );
      }
      allocations = [{ targetId: verifiedPurchase.id, amount: paymentAmount }];
    } else {
      const totalOpen = sumMoney(targets.map((t) => t.balanceDue));
      if (dec(paymentAmount).gt(dec(totalOpen))) {
        throw unprocessable(
          'PAYMENT_EXCEEDS_BALANCE',
          `Payment (${paymentAmount}) exceeds supplier payable balance (${totalOpen})`,
          [{ field: 'amount' }],
        );
      }
      allocations = allocateOldestFirst(targets, paymentAmount);
    }

    const createdPayments = [];
    for (let i = 0; i < allocations.length; i += 1) {
      const alloc = allocations[i]!;
      const clientPaymentId = input.paymentIds?.[i];
      const created = await tx.payment.create({
        data: {
          ...(clientPaymentId ? { id: clientPaymentId } : {}),
          shopId,
          kind: 'PURCHASE_PAYMENT',
          direction: 'OUT',
          method: validMethod,
          amount: alloc.amount,
          paidAt,
          purchaseId: alloc.targetId,
          note: input.note?.trim() || null,
        },
      });
      createdPayments.push(serializePayment(created));
    }

    const totalOpenBefore = sumMoney(targets.map((t) => t.balanceDue));
    const payableBalanceAfter = round2(dec(totalOpenBefore).minus(dec(paymentAmount)));

    return {
      supplierId: verifiedSupplier.id,
      amountPaid: paymentAmount,
      payableBalanceAfter,
      allocations,
      payments: createdPayments,
    };
  });
}

export async function listSupplierPayments(
  shopId: string,
  supplierId: string,
  options: { page: number; pageSize: number },
) {
  const prisma = await ensurePrismaConnected();
  const supplier = await prisma.supplier.findFirst({
    where: scopeWhere(shopId, { id: supplierId }),
    select: { id: true },
  });
  assertFoundInShop(supplier, 'Supplier');

  const where: Prisma.PaymentWhereInput = {
    shopId,
    kind: 'PURCHASE_PAYMENT',
    purchase: { shopId, supplierId },
  };

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
  ]);

  return {
    items: rows.map(serializePayment),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}
