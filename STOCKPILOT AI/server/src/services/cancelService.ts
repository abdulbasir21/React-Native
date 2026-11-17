import { Prisma } from '@prisma/client';
import { badRequest, conflict, unprocessable } from '../lib/errors.js';
import { ensurePrismaConnected } from '../lib/prisma.js';
import { assertFoundInShop } from '../lib/shopScope.js';
import { deriveSaleFinancials, weightedAverage } from '../shared/calculations.js';
import {
  NON_CREDIT_PAYMENT_METHODS,
  type NonCreditPaymentMethod,
  type PaymentDirection,
  type PaymentKind,
  type SaleStatus,
} from '../shared/enums.js';
import { dec, maxDecimal } from '../shared/money.js';
import { applyStockMovement } from './inventoryService.js';
import { getSaleById } from './saleService.js';

export interface CancelSaleInput {
  reason: string;
  refundMethod?: string | null;
  occurredAt?: string | Date;
  paymentId?: string;
}

/**
 * BR-R5, BR-R6, BR-C4:
 * Cancels a COMPLETED sale with zero prior returns in a single atomic transaction:
 * restores stock via SALE_CANCELLATION movements, refunds net amountPaid via one SALE_REFUND payment,
 * and records an AuditLog row.
 */
export async function cancelSale(
  shopId: string,
  saleId: string,
  input: CancelSaleInput,
) {
  const prisma = await ensurePrismaConnected();
  const reason = input.reason?.trim() ?? '';
  if (!reason) {
    throw badRequest('Cancellation reason is required', [{ field: 'reason' }]);
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw badRequest('Invalid occurredAt timestamp', [{ field: 'occurredAt' }]);
  }

  await prisma.$transaction(async (tx) => {
    const lockedSales = await tx.$queryRaw<
      Array<{ id: string; status: string; total: string }>
    >`
      SELECT id, status::text AS status, total::text AS total
      FROM sales
      WHERE id = ${saleId}::uuid AND "shopId" = ${shopId}::uuid
      FOR UPDATE
    `;
    const saleRow = assertFoundInShop(lockedSales[0], 'Sale');
    if (saleRow.status === 'CANCELLED') {
      throw conflict('SALE_ALREADY_CANCELLED', 'Sale is already cancelled');
    }

    const existingReturnsCount = await tx.saleReturn.count({
      where: { shopId, saleId },
    });
    if (existingReturnsCount > 0) {
      throw unprocessable(
        'SALE_HAS_RETURNS',
        'Cannot cancel a sale that already has returns',
        [{ field: 'saleId' }],
      );
    }

    const [saleItems, existingPayments] = await Promise.all([
      tx.saleItem.findMany({ where: { saleId } }),
      tx.payment.findMany({
        where: {
          shopId,
          saleId,
          kind: { in: ['SALE_PAYMENT', 'SALE_REFUND'] as PaymentKind[] },
        },
        select: { kind: true, amount: true },
      }),
    ]);

    const fin = deriveSaleFinancials({
      total: saleRow.total,
      returnedValue: '0.00',
      status: 'COMPLETED' as SaleStatus,
      payments: existingPayments.map((p) => ({
        kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
        amount: p.amount.toString(),
      })),
    });

    if (dec(fin.amountPaid).gt(0)) {
      const method = input.refundMethod;
      if (!method || !(NON_CREDIT_PAYMENT_METHODS as readonly string[]).includes(method)) {
        throw badRequest(
          'refundMethod is required and must be CASH, EASYPAISA, JAZZCASH, BANK_TRANSFER, or CARD when refunding paid amount',
          [{ field: 'refundMethod' }],
        );
      }

      await tx.payment.create({
        data: {
          ...(input.paymentId ? { id: input.paymentId } : {}),
          shopId,
          kind: 'SALE_REFUND' as PaymentKind,
          direction: 'OUT' as PaymentDirection,
          method: method as NonCreditPaymentMethod,
          amount: fin.amountPaid,
          paidAt: occurredAt,
          saleId,
          note: `Sale cancelled: ${reason}`,
        },
      });
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: 'CANCELLED',
        cancelledAt: occurredAt,
        cancelReason: reason,
      },
    });

    const sortedItems = [...saleItems].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const item of sortedItems) {
      const lockedProds = await tx.$queryRaw<
        Array<{ quantityOnHand: string; averageCost: string }>
      >`
        SELECT "quantityOnHand"::text AS "quantityOnHand", "averageCost"::text AS "averageCost"
        FROM products
        WHERE id = ${item.productId}::uuid AND "shopId" = ${shopId}::uuid
        FOR UPDATE
      `;
      const prodRow = assertFoundInShop(lockedProds[0], 'Product');
      const effectiveOldQty = maxDecimal(prodRow.quantityOnHand, 0).toString();
      const nextAverageCost = weightedAverage(
        effectiveOldQty,
        prodRow.averageCost,
        item.quantity.toString(),
        item.unitCostSnapshot.toString(),
      );

      await applyStockMovement(tx, shopId, {
        productId: item.productId,
        type: 'SALE_CANCELLATION',
        quantityChange: item.quantity.toString(),
        saleId,
        reason,
        occurredAt,
        nextAverageCost,
        allowNegativeStock: true,
      });
    }

    await tx.auditLog.create({
      data: {
        shopId,
        entityType: 'Sale',
        entityId: saleId,
        action: 'CANCEL',
        before: { status: 'COMPLETED' } as Prisma.InputJsonValue,
        after: {
          status: 'CANCELLED',
          cancelReason: reason,
          refundedAmount: fin.amountPaid,
        } as Prisma.InputJsonValue,
        reason,
        actor: 'OWNER',
      },
    });
  });

  return getSaleById(shopId, saleId);
}
