import { Prisma } from '@prisma/client';
import { badRequest, conflict, unprocessable } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop, scopeWhere } from '../lib/shopScope.js';
import {
  allocateDiscount,
  applyDiscount,
  customDateRangeBounds,
  deriveSaleFinancials,
  type DiscountInput,
  formatReceiptNo,
  getLocalParts,
  lineCogs,
  lineSubtotal,
  periodBounds,
  type ReportPeriod,
} from '../shared/calculations.js';
import {
  NON_CREDIT_PAYMENT_METHODS,
  type NonCreditPaymentMethod,
  PAYMENT_METHODS,
  type PaymentDirection,
  type PaymentKind,
  type PaymentMethod,
  type SaleStatus,
  type Unit,
} from '../shared/enums.js';
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
import { serializePayment } from './purchaseService.js';

export interface CreateSaleLineInput {
  id?: string;
  movementId?: string;
  productId: string;
  quantity: string | number;
  unitPrice?: string | number | null;
}

export interface CreateSaleInput {
  id?: string;
  paymentId?: string;
  customerId?: string | null;
  items: CreateSaleLineInput[];
  discount?: DiscountInput | null;
  paymentMethod: string;
  amountReceived?: string | number | null;
  idempotencyKey: string;
  occurredAt?: string | Date;
  note?: string | null;
  // Sync-specific fields (Phase 7b; defaults off for normal online POS)
  fromSync?: boolean;
  receiptNo?: string;
  declaredTotal?: string | number;
}

const saleInclude = {
  customer: {
    select: { id: true, name: true, phone: true, archivedAt: true },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
  },
  returns: {
    include: {
      items: true,
    },
    orderBy: { occurredAt: 'desc' as const },
  },
  payments: {
    orderBy: { paidAt: 'asc' as const },
  },
};

export function serializeSaleItem(item: {
  id: string;
  saleId: string;
  productId: string;
  productNameSnapshot: string;
  unitSnapshot: string;
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  lineSubtotal: { toString(): string };
  allocatedDiscount: { toString(): string };
  lineNet: { toString(): string };
  unitCostSnapshot: { toString(): string };
  lineCogs: { toString(): string };
  createdAt: Date;
}) {
  return {
    id: item.id,
    saleId: item.saleId,
    productId: item.productId,
    productNameSnapshot: item.productNameSnapshot,
    unitSnapshot: item.unitSnapshot as Unit,
    quantity: formatQuantity(item.quantity.toString()),
    unitPrice: formatMoney(item.unitPrice.toString()),
    lineSubtotal: formatMoney(item.lineSubtotal.toString()),
    allocatedDiscount: formatMoney(item.allocatedDiscount.toString()),
    lineNet: formatMoney(item.lineNet.toString()),
    unitCostSnapshot: round4(item.unitCostSnapshot.toString()),
    lineCogs: formatMoney(item.lineCogs.toString()),
    createdAt: item.createdAt.toISOString(),
  };
}

export function serializeSale(
  s: {
    id: string;
    shopId: string;
    customerId: string | null;
    customer?: { id: string; name: string; phone: string | null; archivedAt: Date | null } | null;
    receiptNo: string;
    status: string;
    subtotal: { toString(): string };
    discountAmount: { toString(): string };
    total: { toString(): string };
    paymentMethod: string;
    idempotencyKey: string;
    occurredAt: Date;
    cancelledAt: Date | null;
    cancelReason: string | null;
    note: string | null;
    warnings: string[];
    createdAt: Date;
    items?: Parameters<typeof serializeSaleItem>[0][];
    returns?: Array<{
      id: string;
      saleId: string;
      reason: string;
      occurredAt: Date;
      createdAt: Date;
      items: Array<{
        id: string;
        saleItemId: string;
        quantity: { toString(): string };
        refundValue: { toString(): string };
        cogsReversed: { toString(): string };
      }>;
    }>;
    payments: Parameters<typeof serializePayment>[0][];
  },
  returnedValueOverride?: string,
) {
  const totalStr = formatMoney(s.total.toString());
  const status = s.status as SaleStatus;
  const computedReturnedValue =
    returnedValueOverride ??
    (s.returns && s.returns.length > 0
      ? sumMoney(s.returns.flatMap((r) => r.items.map((i) => i.refundValue.toString())))
      : '0.00');

  const returnedQtyByItem = new Map<string, string>();
  if (s.returns) {
    const grouped = new Map<string, string[]>();
    for (const ret of s.returns) {
      for (const ri of ret.items) {
        const list = grouped.get(ri.saleItemId) ?? [];
        list.push(ri.quantity.toString());
        grouped.set(ri.saleItemId, list);
      }
    }
    for (const [saleItemId, qtys] of grouped.entries()) {
      returnedQtyByItem.set(
        saleItemId,
        formatQuantity(qtys.reduce((acc, q) => acc.plus(q), dec(0))),
      );
    }
  }

  const fin = deriveSaleFinancials({
    total: totalStr,
    returnedValue: computedReturnedValue,
    status,
    payments: s.payments.map((p) => ({
      kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
      amount: p.amount.toString(),
    })),
  });

  return {
    id: s.id,
    shopId: s.shopId,
    customerId: s.customerId,
    customer: s.customer
      ? {
          id: s.customer.id,
          name: s.customer.name,
          phone: s.customer.phone,
          archivedAt: s.customer.archivedAt ? s.customer.archivedAt.toISOString() : null,
        }
      : null,
    receiptNo: s.receiptNo,
    status,
    subtotal: formatMoney(s.subtotal.toString()),
    discountAmount: formatMoney(s.discountAmount.toString()),
    total: totalStr,
    returnedValue: formatMoney(computedReturnedValue),
    netTotal: fin.netTotal,
    amountPaid: fin.amountPaid,
    balanceDue: fin.balanceDue,
    paymentMethod: s.paymentMethod as PaymentMethod,
    paymentStatus: fin.paymentStatus,
    idempotencyKey: s.idempotencyKey,
    occurredAt: s.occurredAt.toISOString(),
    cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
    cancelReason: s.cancelReason,
    note: s.note,
    warnings: s.warnings,
    createdAt: s.createdAt.toISOString(),
    items: s.items
      ? s.items.map((item) => ({
          ...serializeSaleItem(item),
          returnedQuantity: returnedQtyByItem.get(item.id) ?? '0',
        }))
      : undefined,
    returns: (s.returns ?? []).map((r) => ({
      id: r.id,
      saleId: r.saleId,
      reason: r.reason,
      occurredAt: r.occurredAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      items: r.items.map((ri) => ({
        id: ri.id,
        saleItemId: ri.saleItemId,
        quantity: formatQuantity(ri.quantity.toString()),
        refundValue: formatMoney(ri.refundValue.toString()),
        cogsReversed: formatMoney(ri.cogsReversed.toString()),
      })),
    })),
    payments: s.payments.map(serializePayment),
  };
}

function assertPaymentMethod(method: string | undefined): PaymentMethod {
  if (!method || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw badRequest('Invalid paymentMethod', [{ field: 'paymentMethod' }]);
  }
  return method as PaymentMethod;
}

function assertNonCreditMethod(method: string | undefined, field = 'method'): NonCreditPaymentMethod {
  if (!method || !(NON_CREDIT_PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw badRequest(`${field} must be CASH, EASYPAISA, JAZZCASH, BANK_TRANSFER, or CARD`, [
      { field },
    ]);
  }
  return method as NonCreditPaymentMethod;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

export async function createSale(shopId: string, input: CreateSaleInput) {
  const prisma = await ensurePrismaConnected();

  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) {
    throw badRequest('idempotencyKey is required', [{ field: 'idempotencyKey' }]);
  }

  // BR-SA8: pre-check idempotency
  const existingReplay = await prisma.sale.findUnique({
    where: { shopId_idempotencyKey: { shopId, idempotencyKey } },
    include: saleInclude,
  });
  if (existingReplay) {
    return { sale: serializeSale(existingReplay), idempotentReplay: true };
  }

  // BR-SA1: 1 to 200 items
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 200) {
    throw badRequest('A sale must have between 1 and 200 items', [{ field: 'items' }]);
  }

  const paymentMethod = assertPaymentMethod(input.paymentMethod);

  // BR-SA11: device occurredAt clamped with CLOCK_SKEW if > server now + 10 min
  const serverNow = new Date();
  let occurredAt = input.occurredAt ? new Date(input.occurredAt) : serverNow;
  if (Number.isNaN(occurredAt.getTime())) {
    throw badRequest('Invalid occurredAt timestamp', [{ field: 'occurredAt' }]);
  }
  const warnings: string[] = [];
  if (occurredAt.getTime() > serverNow.getTime() + TEN_MINUTES_MS) {
    occurredAt = serverNow;
    warnings.push('CLOCK_SKEW');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Check idempotency inside transaction as well
      const innerReplay = await tx.sale.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey } },
        select: { id: true },
      });
      if (innerReplay) {
        return { id: innerReplay.id, idempotentReplay: true };
      }

      // Lock shop row FOR UPDATE to serialize receiptNo generation per shop (BR-SA9)
      const shopRows = await tx.$queryRaw<
        Array<{ id: string; timezone: string }>
      >`
        SELECT id, timezone
        FROM shops
        WHERE id = ${shopId}::uuid
        FOR UPDATE
      `;
      const lockedShop = assertFoundInShop(shopRows[0], 'Shop');

      // Deterministic sorted row locking for all products in sale
      const uniqueProductIds = [...new Set(input.items.map((l) => l.productId))].sort();
      const lockedProducts = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          unit: string;
          sellingPrice: string;
          averageCost: string;
          quantityOnHand: string;
          archivedAt: Date | null;
        }>
      >`
        SELECT id, name, unit::text AS unit, "sellingPrice"::text AS "sellingPrice",
               "averageCost"::text AS "averageCost", "quantityOnHand"::text AS "quantityOnHand",
               "archivedAt"
        FROM products
        WHERE "shopId" = ${shopId}::uuid
          AND id IN (${Prisma.join(uniqueProductIds.map((pid) => Prisma.sql`${pid}::uuid`))})
        ORDER BY id ASC
        FOR UPDATE
      `;

      const productMap = new Map<
        string,
        {
          id: string;
          name: string;
          unit: Unit;
          sellingPrice: string;
          averageCost: string;
          archivedAt: Date | null;
        }
      >();
      for (const row of lockedProducts) {
        productMap.set(row.id, {
          id: row.id,
          name: row.name,
          unit: row.unit as Unit,
          sellingPrice: formatMoney(row.sellingPrice),
          averageCost: round4(row.averageCost),
          archivedAt: row.archivedAt,
        });
      }

      const rawLines: Array<{
        id?: string;
        movementId?: string;
        productId: string;
        productNameSnapshot: string;
        unitSnapshot: Unit;
        quantity: string;
        unitPrice: string;
        lineSubtotal: string;
        unitCostSnapshot: string;
        lineCogs: string;
      }> = [];

      for (let i = 0; i < input.items.length; i += 1) {
        const line = input.items[i]!;
        const verifiedProduct = assertFoundInShop(productMap.get(line.productId), 'Product');

        // BR-SA12: archived products cannot be sold
        if (verifiedProduct.archivedAt !== null) {
          throw conflict(
            'PRODUCT_ARCHIVED',
            `Product "${verifiedProduct.name}" is archived and cannot be sold`,
            [{ field: `items[${i}].productId` }],
          );
        }

        // BR-SA1 + BR-P5: quantity > 0 respecting unit rules
        const unitCheck = validateQuantityForUnit(line.quantity, verifiedProduct.unit, false);
        if (!unitCheck.valid) {
          throw badRequest(unitCheck.reason ?? 'Invalid quantity for product unit', [
            { field: `items[${i}].quantity`, message: unitCheck.reason },
          ]);
        }

        const qtyStr = formatQuantity(line.quantity);
        let unitPriceStr = verifiedProduct.sellingPrice;
        if (line.unitPrice !== undefined && line.unitPrice !== null) {
          let priceDec;
          try {
            priceDec = dec(line.unitPrice);
          } catch {
            throw badRequest('Invalid unitPrice', [{ field: `items[${i}].unitPrice` }]);
          }
          if (priceDec.lt(0)) {
            throw badRequest('unitPrice must be >= 0', [{ field: `items[${i}].unitPrice` }]);
          }
          unitPriceStr = round2(priceDec);
        }

        const lSubtotal = lineSubtotal(qtyStr, unitPriceStr);
        const unitCostSnapshot = verifiedProduct.averageCost;
        const lCogs = lineCogs(qtyStr, unitCostSnapshot);

        rawLines.push({
          id: line.id,
          movementId: line.movementId,
          productId: line.productId,
          productNameSnapshot: verifiedProduct.name,
          unitSnapshot: verifiedProduct.unit,
          quantity: qtyStr,
          unitPrice: unitPriceStr,
          lineSubtotal: lSubtotal,
          unitCostSnapshot,
          lineCogs: lCogs,
        });
      }

      // BR-SA2 + BR-SA6: recalculate subtotal, discount, total on server
      const subtotal = sumMoney(rawLines.map((l) => l.lineSubtotal));
      let discountResult;
      try {
        discountResult = applyDiscount(subtotal, input.discount);
      } catch (err) {
        throw badRequest(err instanceof Error ? err.message : 'Invalid discount', [
          { field: 'discount' },
        ]);
      }

      const { discountAmount, total } = discountResult;
      const allocatedLines = allocateDiscount(
        rawLines.map((l) => l.lineSubtotal),
        discountAmount,
      );

      if (input.fromSync && input.declaredTotal !== undefined) {
        let declaredStr: string;
        try {
          declaredStr = round2(input.declaredTotal);
        } catch {
          declaredStr = '';
        }
        if (declaredStr !== total && !warnings.includes('TOTAL_MISMATCH')) {
          warnings.push('TOTAL_MISMATCH');
        }
      }

      // BR-SA4: payment validation
      let amountReceived = '0.00';
      if (paymentMethod === 'CREDIT') {
        if (input.amountReceived !== undefined && input.amountReceived !== null) {
          let amtDec;
          try {
            amtDec = dec(input.amountReceived);
          } catch {
            throw badRequest('Invalid amountReceived', [{ field: 'amountReceived' }]);
          }
          if (amtDec.lt(0)) {
            throw badRequest('amountReceived must be >= 0', [{ field: 'amountReceived' }]);
          }
          if (amtDec.gt(0)) {
            throw badRequest('CREDIT sales must have amountReceived equal to 0', [
              { field: 'amountReceived' },
            ]);
          }
        }
      } else {
        if (input.amountReceived === undefined || input.amountReceived === null) {
          throw badRequest('amountReceived is required for non-CREDIT payment methods', [
            { field: 'amountReceived' },
          ]);
        }
        let amtDec;
        try {
          amtDec = dec(input.amountReceived);
        } catch {
          throw badRequest('Invalid amountReceived', [{ field: 'amountReceived' }]);
        }
        if (amtDec.lt(0)) {
          throw badRequest('amountReceived must be >= 0', [{ field: 'amountReceived' }]);
        }
        if (dec(total).gt(0) && amtDec.lte(0)) {
          throw badRequest('amountReceived must be greater than 0 for non-CREDIT sales', [
            { field: 'amountReceived' },
          ]);
        }
        if (amtDec.gt(dec(total))) {
          throw unprocessable('PAYMENT_EXCEEDS_TOTAL', 'amountReceived cannot exceed sale total', [
            { field: 'amountReceived' },
          ]);
        }
        amountReceived = round2(amtDec);
      }

      // BR-SA5: customer required when total - amountReceived > 0; validate if provided
      const remainingBalance = dec(total).minus(dec(amountReceived));
      if (remainingBalance.gt(0) && !input.customerId) {
        throw badRequest('A customer is required for partial or credit sales', [
          { field: 'customerId' },
        ]);
      }

      let verifiedCustomerId: string | null = null;
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: scopeWhere(shopId, { id: input.customerId }),
        });
        const verifiedCustomer = assertFoundInShop(customer, 'Customer');
        if (verifiedCustomer.archivedAt !== null) {
          throw conflict(
            'CUSTOMER_ARCHIVED',
            'Archived customer cannot be attached to new sales',
            [{ field: 'customerId' }],
          );
        }
        verifiedCustomerId = verifiedCustomer.id;
      }

      // BR-SA9: generate unique shop-local receiptNo RCP-YYYYMMDD-NNNN
      const compactDate = getLocalParts(occurredAt, lockedShop.timezone).compactDate;
      const prefix = `RCP-${compactDate}-`;
      const existingReceipts = await tx.sale.findMany({
        where: {
          shopId,
          receiptNo: { startsWith: prefix },
        },
        select: { receiptNo: true },
      });

      let maxSeq = 0;
      for (const r of existingReceipts) {
        const suffix = r.receiptNo.slice(prefix.length);
        const parsed = Number.parseInt(suffix, 10);
        if (Number.isFinite(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
        }
      }

      let receiptNo: string;
      const requestedReceipt = input.fromSync ? input.receiptNo?.trim() : undefined;
      if (requestedReceipt) {
        const collision = await tx.sale.findFirst({
          where: { shopId, receiptNo: requestedReceipt },
          select: { id: true },
        });
        if (!collision) {
          receiptNo = requestedReceipt;
        } else {
          receiptNo = formatReceiptNo(compactDate, maxSeq + 1);
          if (!warnings.includes('RECEIPT_RENUMBERED')) {
            warnings.push('RECEIPT_RENUMBERED');
          }
        }
      } else {
        receiptNo = formatReceiptNo(compactDate, maxSeq + 1);
      }

      const sale = await tx.sale.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          shopId,
          customerId: verifiedCustomerId,
          receiptNo,
          status: 'COMPLETED',
          subtotal,
          discountAmount,
          total,
          paymentMethod,
          idempotencyKey,
          occurredAt,
          note: input.note?.trim() || null,
          warnings,
        },
      });

      for (let i = 0; i < rawLines.length; i += 1) {
        const line = rawLines[i]!;
        const alloc = allocatedLines[i]!;
        await tx.saleItem.create({
          data: {
            ...(line.id ? { id: line.id } : {}),
            saleId: sale.id,
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            unitSnapshot: line.unitSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineSubtotal: line.lineSubtotal,
            allocatedDiscount: alloc.allocatedDiscount,
            lineNet: alloc.lineNet,
            unitCostSnapshot: line.unitCostSnapshot,
            lineCogs: line.lineCogs,
          },
        });
      }

      if (paymentMethod !== 'CREDIT' && dec(amountReceived).gt(0)) {
        await tx.payment.create({
          data: {
            ...(input.paymentId ? { id: input.paymentId } : {}),
            shopId,
            kind: 'SALE_PAYMENT',
            direction: 'IN',
            method: paymentMethod,
            amount: amountReceived,
            paidAt: occurredAt,
            saleId: sale.id,
            note: input.note?.trim() || null,
          },
        });
      }

      let wentNegative = false;
      for (const line of rawLines) {
        const moveResult = await applyStockMovement(tx, shopId, {
          id: line.movementId,
          productId: line.productId,
          type: 'SALE',
          quantityChange: `-${line.quantity}`,
          saleId: sale.id,
          occurredAt,
          allowNegativeStock: Boolean(input.fromSync),
          requireActiveProduct: true,
        });
        if (dec(moveResult.newQty).lt(0)) {
          wentNegative = true;
        }
      }

      if (input.fromSync && wentNegative && !warnings.includes('NEGATIVE_STOCK')) {
        await tx.sale.update({
          where: { id: sale.id },
          data: { warnings: [...warnings, 'NEGATIVE_STOCK'] },
        });
      }

      return { id: sale.id, idempotentReplay: false };
    });

    const sale = await getSaleById(shopId, result.id);
    return { sale, idempotentReplay: result.idempotentReplay };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const replay = await prisma.sale.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey } },
        include: saleInclude,
      });
      if (replay) {
        return { sale: serializeSale(replay), idempotentReplay: true };
      }
    }
    throw err;
  }
}

export async function listSales(
  shopId: string,
  options: {
    page: number;
    pageSize: number;
    search?: string;
    status?: SaleStatus;
    paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | 'NOT_APPLICABLE';
    customerId?: string;
    period?: ReportPeriod;
    fromDate?: string;
    toDate?: string;
  },
) {
  const prisma = await ensurePrismaConnected();
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { timezone: true },
  });
  const timeZone = shop?.timezone ?? 'Asia/Karachi';

  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (options.period) {
    const b = periodBounds(options.period, timeZone);
    dateFilter = { gte: b.startUtc, lt: b.endUtc };
  } else if (options.fromDate && options.toDate) {
    try {
      const b = customDateRangeBounds(options.fromDate, options.toDate, timeZone);
      dateFilter = { gte: b.startUtc, lt: b.endUtc };
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : 'Invalid date range');
    }
  }

  const search = options.search?.trim();
  const where = scopeWhere(shopId, {
    ...(options.status ? { status: options.status } : {}),
    ...(options.customerId ? { customerId: options.customerId } : {}),
    ...(dateFilter ? { occurredAt: dateFilter } : {}),
    ...(search
      ? {
          OR: [
            { receiptNo: { contains: search, mode: 'insensitive' as const } },
            { note: { contains: search, mode: 'insensitive' as const } },
            { customer: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  });

  if (options.paymentStatus) {
    const allRows = await prisma.sale.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: saleInclude,
    });
    const filtered = allRows
      .map((row) => serializeSale(row))
      .filter((s) => s.paymentStatus === options.paymentStatus);
    const total = filtered.length;
    const start = (options.page - 1) * options.pageSize;
    return {
      items: filtered.slice(start, start + options.pageSize),
      meta: { page: options.page, pageSize: options.pageSize, total },
    };
  }

  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      include: saleInclude,
    }),
  ]);

  return {
    items: rows.map((row) => serializeSale(row)),
    meta: { page: options.page, pageSize: options.pageSize, total },
  };
}

export async function getSaleById(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const sale = await prisma.sale.findFirst({
    where: scopeWhere(shopId, { id }),
    include: saleInclude,
  });
  return serializeSale(assertFoundInShop(sale, 'Sale'));
}

export async function getSaleReceiptData(shopId: string, id: string) {
  const prisma = await ensurePrismaConnected();
  const [shop, sale] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        timezone: true,
        address: true,
        phone: true,
      },
    }),
    prisma.sale.findFirst({
      where: scopeWhere(shopId, { id }),
      include: saleInclude,
    }),
  ]);

  const verifiedShop = assertFoundInShop(shop, 'Shop');
  const verifiedSale = assertFoundInShop(sale, 'Sale');

  return {
    shop: verifiedShop,
    sale: serializeSale(verifiedSale),
  };
}

/**
 * BR-PAY3 (single-sale payment): 0 < amount <= balanceDue, non-CREDIT method.
 */
export async function addSalePayment(
  shopId: string,
  saleId: string,
  input: {
    id?: string;
    amount: string | number;
    method: string;
    paidAt?: string | Date;
    note?: string | null;
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
    throw badRequest('Payment amount must be greater than 0', [{ field: 'amount' }]);
  }
  const amountStr = round2(amountDec);

  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    throw badRequest('Invalid paidAt timestamp', [{ field: 'paidAt' }]);
  }

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; status: string; total: string }>>`
      SELECT id, status::text AS status, total::text AS total
      FROM sales
      WHERE id = ${saleId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const saleRow = assertFoundInShop(locked[0], 'Sale');
    if (saleRow.status === 'CANCELLED') {
      throw conflict('SALE_CANCELLED', 'Cancelled sales cannot receive payments');
    }

    const [existingPayments, existingReturnItems] = await Promise.all([
      tx.payment.findMany({
        where: { shopId, saleId },
        select: { kind: true, amount: true },
      }),
      tx.saleReturnItem.findMany({
        where: { saleReturn: { shopId, saleId } },
        select: { refundValue: true },
      }),
    ]);

    const returnedValue = sumMoney(existingReturnItems.map((r) => r.refundValue.toString()));

    const fin = deriveSaleFinancials({
      total: saleRow.total,
      returnedValue,
      status: saleRow.status as SaleStatus,
      payments: existingPayments.map((p) => ({
        kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
        amount: p.amount.toString(),
      })),
    });

    if (dec(amountStr).gt(dec(fin.balanceDue))) {
      throw unprocessable(
        'PAYMENT_EXCEEDS_BALANCE',
        `Payment ${amountStr} exceeds sale balance due ${fin.balanceDue}`,
        [{ field: 'amount' }],
      );
    }

    await tx.payment.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        shopId,
        kind: 'SALE_PAYMENT' as PaymentKind,
        direction: 'IN' as PaymentDirection,
        method: validMethod,
        amount: amountStr,
        paidAt,
        saleId,
        note: input.note?.trim() || null,
      },
    });
  });

  return getSaleById(shopId, saleId);
}

/**
 * BR-PAY4: Derived customer outstanding balance = sum of balanceDue over COMPLETED sales.
 */
export async function getCustomerOutstandingMap(
  shopId: string,
  customerIds?: string[],
): Promise<Map<string, string>> {
  const prisma = await ensurePrismaConnected();
  if (customerIds && customerIds.length === 0) {
    return new Map();
  }

  const sales = await prisma.sale.findMany({
    where: scopeWhere(shopId, {
      status: 'COMPLETED' as SaleStatus,
      customerId: customerIds ? { in: customerIds } : { not: null },
    }),
    select: {
      id: true,
      customerId: true,
      status: true,
      total: true,
      returns: {
        select: {
          items: {
            select: { refundValue: true },
          },
        },
      },
      payments: {
        where: { kind: { in: ['SALE_PAYMENT', 'SALE_REFUND'] as PaymentKind[] } },
        select: { kind: true, amount: true },
      },
    },
  });

  const totalsByCustomer = new Map<string, string[]>();
  for (const s of sales) {
    if (!s.customerId) continue;
    const returnedValue = sumMoney(
      s.returns.flatMap((r) => r.items.map((i) => i.refundValue.toString())),
    );
    const fin = deriveSaleFinancials({
      total: s.total.toString(),
      returnedValue,
      status: s.status as SaleStatus,
      payments: s.payments.map((p) => ({
        kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
        amount: p.amount.toString(),
      })),
    });
    const list = totalsByCustomer.get(s.customerId) ?? [];
    list.push(fin.balanceDue);
    totalsByCustomer.set(s.customerId, list);
  }

  const result = new Map<string, string>();
  for (const [cid, balances] of totalsByCustomer.entries()) {
    result.set(cid, sumMoney(balances));
  }
  return result;
}
