import { Prisma } from '@prisma/client';
import { badRequest, conflict, unprocessable } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop } from '../lib/shopScope.js';
import {
  deriveSaleFinancials,
  refundValue as calcRefundValue,
  weightedAverage,
} from '../shared/calculations.js';
import {
  NON_CREDIT_PAYMENT_METHODS,
  type NonCreditPaymentMethod,
  type PaymentDirection,
  type PaymentKind,
  type SaleStatus,
  type Unit,
} from '../shared/enums.js';
import {
  addMoney,
  dec,
  formatMoney,
  formatQuantity,
  maxDecimal,
  round2,
  sumMoney,
  sumQty,
  validateQuantityForUnit,
} from '../shared/money.js';
import { applyStockMovement } from './inventoryService.js';
import { getSaleById } from './saleService.js';

export interface CreateSaleReturnItemInput {
  id?: string;
  movementId?: string;
  saleItemId: string;
  quantity: string | number;
}

export interface CreateSaleReturnInput {
  id?: string;
  paymentId?: string;
  reason: string;
  refundMethod?: string | null;
  occurredAt?: string | Date;
  items: CreateSaleReturnItemInput[];
}

function assertNonCreditRefundMethod(method: string | null | undefined): NonCreditPaymentMethod {
  if (!method || !(NON_CREDIT_PAYMENT_METHODS as readonly string[]).includes(method)) {
    throw badRequest(
      'refundMethod is required and must be CASH, EASYPAISA, JAZZCASH, BANK_TRANSFER, or CARD when a refund is due',
      [{ field: 'refundMethod' }],
    );
  }
  return method as NonCreditPaymentMethod;
}

/**
 * BR-R1..BR-R4, BR-R6, BR-C4:
 * Processes a customer return against a COMPLETED sale in a single atomic transaction.
 */
export async function createSaleReturn(
  shopId: string,
  saleId: string,
  input: CreateSaleReturnInput,
) {
  const prisma = await ensurePrismaConnected();
  const reason = input.reason?.trim() ?? '';
  if (!reason) {
    throw badRequest('Return reason is required', [{ field: 'reason' }]);
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw badRequest('At least one return item is required', [{ field: 'items' }]);
  }

  const seenSaleItemIds = new Set<string>();
  for (const item of input.items) {
    if (seenSaleItemIds.has(item.saleItemId)) {
      throw badRequest('Duplicate saleItemId in return request', [{ field: 'items' }]);
    }
    seenSaleItemIds.add(item.saleItemId);
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw badRequest('Invalid occurredAt timestamp', [{ field: 'occurredAt' }]);
  }

  const returnResult = await prisma.$transaction(async (tx) => {
    const lockedSales = await tx.$queryRaw<
      Array<{ id: string; status: string; total: string }>
    >`
      SELECT id, status::text AS status, total::text AS total
      FROM sales
      WHERE id = ${saleId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const saleRow = assertFoundInShop(lockedSales[0], 'Sale');
    if (saleRow.status !== 'COMPLETED') {
      throw conflict('SALE_CANCELLED', 'Cancelled sales cannot be returned');
    }

    const [saleItems, previousReturnItems, existingPayments] = await Promise.all([
      tx.saleItem.findMany({
        where: { saleId },
      }),
      tx.saleReturnItem.findMany({
        where: { saleReturn: { saleId, shopId } },
      }),
      tx.payment.findMany({
        where: {
          shopId,
          saleId,
          kind: { in: ['SALE_PAYMENT', 'SALE_REFUND'] as PaymentKind[] },
        },
        select: { kind: true, amount: true },
      }),
    ]);

    const saleItemMap = new Map(saleItems.map((si) => [si.id, si]));
    const priorBySaleItem = new Map<
      string,
      { qty: string[]; refund: string[]; cogs: string[] }
    >();

    for (const prev of previousReturnItems) {
      const bucket = priorBySaleItem.get(prev.saleItemId) ?? {
        qty: [],
        refund: [],
        cogs: [],
      };
      bucket.qty.push(prev.quantity.toString());
      bucket.refund.push(prev.refundValue.toString());
      bucket.cogs.push(prev.cogsReversed.toString());
      priorBySaleItem.set(prev.saleItemId, bucket);
    }

    const computedLines: Array<{
      id?: string;
      movementId?: string;
      saleItemId: string;
      productId: string;
      unitCostSnapshot: string;
      quantity: string;
      refundValue: string;
      cogsReversed: string;
    }> = [];

    for (const reqLine of input.items) {
      const saleItem = saleItemMap.get(reqLine.saleItemId);
      if (!saleItem) {
        throw badRequest('Sale item does not belong to this sale', [{ field: 'items' }]);
      }

      const unitCheck = validateQuantityForUnit(reqLine.quantity, saleItem.unitSnapshot as Unit, false);
      if (!unitCheck.valid) {
        throw badRequest(unitCheck.reason ?? 'Invalid return quantity for unit', [
          { field: 'items', message: unitCheck.reason },
        ]);
      }

      const qtyStr = formatQuantity(reqLine.quantity);
      const prior = priorBySaleItem.get(saleItem.id);
      const alreadyReturnedQty = prior ? sumQty(prior.qty) : '0';
      const alreadyRefunded = prior ? sumMoney(prior.refund) : '0.00';
      const alreadyReversedCogs = prior ? sumMoney(prior.cogs) : '0.00';

      const remaining = dec(saleItem.quantity.toString()).minus(alreadyReturnedQty);
      if (dec(qtyStr).gt(remaining)) {
        throw unprocessable(
          'RETURN_EXCEEDS_SOLD',
          `Return quantity ${qtyStr} exceeds remaining returnable quantity ${formatQuantity(remaining)} for ${saleItem.productNameSnapshot}`,
          [{ field: 'items' }],
        );
      }

      const { refundValue, cogsReversed } = calcRefundValue({
        lineNet: saleItem.lineNet.toString(),
        lineCogs: saleItem.lineCogs.toString(),
        soldQty: saleItem.quantity.toString(),
        alreadyReturnedQty,
        alreadyRefundedValue: alreadyRefunded,
        alreadyReversedCogs,
        returnQty: qtyStr,
      });

      computedLines.push({
        id: reqLine.id,
        movementId: reqLine.movementId,
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        unitCostSnapshot: saleItem.unitCostSnapshot.toString(),
        quantity: qtyStr,
        refundValue,
        cogsReversed,
      });
    }

    const totalPreviousReturned = sumMoney(
      previousReturnItems.map((r) => r.refundValue.toString()),
    );
    const totalNewReturned = sumMoney(computedLines.map((l) => l.refundValue));
    const totalReturnedAfter = addMoney(totalPreviousReturned, totalNewReturned);

    const finAfter = deriveSaleFinancials({
      total: saleRow.total,
      returnedValue: totalReturnedAfter,
      status: 'COMPLETED' as SaleStatus,
      payments: existingPayments.map((p) => ({
        kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
        amount: p.amount.toString(),
      })),
    });

    const excessDec = dec(finAfter.amountPaid).minus(finAfter.netTotal);
    const refundPaymentAmount = excessDec.gt(0) ? round2(excessDec) : '0.00';

    let refundPaymentId: string | null = null;
    if (dec(refundPaymentAmount).gt(0)) {
      const validRefundMethod = assertNonCreditRefundMethod(input.refundMethod);
      const payment = await tx.payment.create({
        data: {
          ...(input.paymentId ? { id: input.paymentId } : {}),
          shopId,
          kind: 'SALE_REFUND' as PaymentKind,
          direction: 'OUT' as PaymentDirection,
          method: validRefundMethod,
          amount: refundPaymentAmount,
          paidAt: occurredAt,
          saleId,
          note: `Return refund: ${reason}`,
        },
      });
      refundPaymentId = payment.id;
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        shopId,
        saleId,
        reason,
        occurredAt,
      },
    });

    // Lock products in deterministic order and update stock + weighted avg cost per BR-C4
    const sortedLines = [...computedLines].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const line of sortedLines) {
      await tx.saleReturnItem.create({
        data: {
          ...(line.id ? { id: line.id } : {}),
          saleReturnId: saleReturn.id,
          saleItemId: line.saleItemId,
          quantity: line.quantity,
          refundValue: line.refundValue,
          cogsReversed: line.cogsReversed,
        },
      });

      const lockedProds = await tx.$queryRaw<
        Array<{ quantityOnHand: string; averageCost: string }>
      >`
        SELECT "quantityOnHand"::text AS "quantityOnHand", "averageCost"::text AS "averageCost"
        FROM products
        WHERE id = ${line.productId}::uuid AND "shopId" = ${shopId}::uuid
        FOR UPDATE
      `;
      const prodRow = assertFoundInShop(lockedProds[0], 'Product');
      const effectiveOldQty = maxDecimal(prodRow.quantityOnHand, 0).toString();
      const nextAverageCost = weightedAverage(
        effectiveOldQty,
        prodRow.averageCost,
        line.quantity,
        line.unitCostSnapshot,
      );

      await applyStockMovement(tx, shopId, {
        id: line.movementId,
        productId: line.productId,
        type: 'CUSTOMER_RETURN',
        quantityChange: line.quantity,
        saleId,
        saleReturnId: saleReturn.id,
        reason,
        occurredAt,
        nextAverageCost,
        allowNegativeStock: true,
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        entityType: 'SaleReturn',
        entityId: saleReturn.id,
        action: 'CREATE',
        after: {
          saleId,
          reason,
          returnedValue: totalNewReturned,
          refundPaymentAmount,
          refundPaymentId,
          items: computedLines.map((l) => ({
            saleItemId: l.saleItemId,
            quantity: l.quantity,
            refundValue: l.refundValue,
            cogsReversed: l.cogsReversed,
          })),
        } as Prisma.InputJsonValue,
        reason,
        actor: 'OWNER',
      },
    });

    return {
      saleReturnId: saleReturn.id,
      returnedValue: formatMoney(totalNewReturned),
      refundPaymentAmount,
    };
  });

  const sale = await getSaleById(shopId, saleId);
  return {
    ...returnResult,
    sale,
  };
}
