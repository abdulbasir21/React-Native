import type { SaleDTO } from '../repositories/saleRepository';
import { deriveSaleFinancials, refundValue } from '../shared/calculations';
import type { PaymentKind } from '../shared/enums';
import { addMoney, dec, round2, sumMoney, validateQuantityForUnit } from '../shared/money';

export interface ReturnPreviewResult {
  valid: boolean;
  error: string | null;
  totalRefundValue: string;
  excessCashRefund: string;
  requiresRefundMethod: boolean;
  selectedLines: Array<{ saleItemId: string; quantity: string; refundValue: string }>;
}

export function previewSaleReturn(
  sale: SaleDTO,
  requestedQtyByItemId: Record<string, string>,
  reason: string,
): ReturnPreviewResult {
  if (sale.status !== 'COMPLETED') {
    return {
      valid: false,
      error: 'Cancelled sales cannot be returned.',
      totalRefundValue: '0.00',
      excessCashRefund: '0.00',
      requiresRefundMethod: false,
      selectedLines: [],
    };
  }

  if (!reason.trim()) {
    return {
      valid: false,
      error: 'Please enter a reason for this return.',
      totalRefundValue: '0.00',
      excessCashRefund: '0.00',
      requiresRefundMethod: false,
      selectedLines: [],
    };
  }

  const items = sale.items ?? [];
  const priorBySaleItem = new Map<
    string,
    { qty: string; refund: string; cogs: string }
  >();
  for (const ret of sale.returns ?? []) {
    for (const ri of ret.items) {
      const prev = priorBySaleItem.get(ri.saleItemId) ?? { qty: '0', refund: '0.00', cogs: '0.00' };
      priorBySaleItem.set(ri.saleItemId, {
        qty: dec(prev.qty).plus(ri.quantity).toString(),
        refund: addMoney(prev.refund, ri.refundValue),
        cogs: addMoney(prev.cogs, ri.cogsReversed),
      });
    }
  }

  const selectedLines: Array<{ saleItemId: string; quantity: string; refundValue: string }> = [];

  for (const item of items) {
    const raw = (requestedQtyByItemId[item.id] ?? '').trim();
    if (!raw || raw === '0') continue;

    const unitCheck = validateQuantityForUnit(raw, item.unitSnapshot, false);
    if (!unitCheck.valid) {
      return {
        valid: false,
        error: `${item.productNameSnapshot}: ${unitCheck.reason ?? 'Invalid quantity'}`,
        totalRefundValue: '0.00',
        excessCashRefund: '0.00',
        requiresRefundMethod: false,
        selectedLines: [],
      };
    }

    const prior = priorBySaleItem.get(item.id) ?? { qty: '0', refund: '0.00', cogs: '0.00' };
    const remaining = dec(item.quantity).minus(prior.qty);
    if (dec(raw).gt(remaining)) {
      return {
        valid: false,
        error: `${item.productNameSnapshot}: return qty exceeds remaining (${remaining.toString()})`,
        totalRefundValue: '0.00',
        excessCashRefund: '0.00',
        requiresRefundMethod: false,
        selectedLines: [],
      };
    }

    const calc = refundValue({
      lineNet: item.lineNet,
      lineCogs: item.lineCogs,
      soldQty: item.quantity,
      alreadyReturnedQty: prior.qty,
      alreadyRefundedValue: prior.refund,
      alreadyReversedCogs: prior.cogs,
      returnQty: raw,
    });

    selectedLines.push({
      saleItemId: item.id,
      quantity: raw,
      refundValue: calc.refundValue,
    });
  }

  if (selectedLines.length === 0) {
    return {
      valid: false,
      error: 'Enter a return quantity for at least one item.',
      totalRefundValue: '0.00',
      excessCashRefund: '0.00',
      requiresRefundMethod: false,
      selectedLines: [],
    };
  }

  const totalRefundValue = sumMoney(selectedLines.map((l) => l.refundValue));
  const totalReturnedAfter = addMoney(sale.returnedValue, totalRefundValue);
  const finAfter = deriveSaleFinancials({
    total: sale.total,
    returnedValue: totalReturnedAfter,
    status: sale.status,
    payments: sale.payments.map((p) => ({
      kind: p.kind as Extract<PaymentKind, 'SALE_PAYMENT' | 'SALE_REFUND'>,
      amount: p.amount,
    })),
  });

  const excessDec = dec(finAfter.amountPaid).minus(finAfter.netTotal);
  const excessCashRefund = excessDec.gt(0) ? round2(excessDec) : '0.00';

  return {
    valid: true,
    error: null,
    totalRefundValue,
    excessCashRefund,
    requiresRefundMethod: dec(excessCashRefund).gt(0),
    selectedLines,
  };
}

export function validateCancelConfirmation(
  sale: SaleDTO,
  reason: string,
): { allowed: boolean; error: string | null; refundAmount: string } {
  if (sale.status === 'CANCELLED') {
    return { allowed: false, error: 'This sale is already cancelled.', refundAmount: '0.00' };
  }
  if ((sale.returns?.length ?? 0) > 0 || dec(sale.returnedValue).gt(0)) {
    return {
      allowed: false,
      error: 'Sales with returns cannot be cancelled.',
      refundAmount: '0.00',
    };
  }
  if (!reason.trim()) {
    return {
      allowed: false,
      error: 'Cancellation reason is required.',
      refundAmount: sale.amountPaid,
    };
  }
  return {
    allowed: true,
    error: null,
    refundAmount: sale.amountPaid,
  };
}
