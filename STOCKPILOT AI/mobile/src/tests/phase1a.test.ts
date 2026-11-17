import { describe, expect, it } from 'vitest';
import {
  allocateDiscount,
  applyDiscount,
  costAfterAdjustment,
  deriveSaleFinancials,
  formatReceiptNo,
  lineCogs,
  lineSubtotal,
  periodBounds,
  refundValue,
  weightedAverage,
} from '../shared/calculations.js';
import goldenVectors from '../shared/golden-vectors.json' with { type: 'json' };
import { addMoney, round2, round4, sumMoney, validateQuantityForUnit } from '../shared/money.js';

describe('Phase 1a — Mobile Shared Pure Function Parity', () => {
  it('BR-G1, BR-G2, BR-P5: mobile money & unit validation match golden vectors', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    for (const row of goldenVectors.roundingHalfUp) {
      if (row.expectedRound2) expect(round2(row.input)).toBe(row.expectedRound2);
      if (row.expectedRound4) expect(round4(row.input)).toBe(row.expectedRound4);
    }
    expect(validateQuantityForUnit('1.255', 'KG').valid).toBe(true);
    expect(validateQuantityForUnit('1.5', 'PIECE').valid).toBe(false);
  });

  it('BR-SA1, BR-SA2, BR-SA3, BR-SA9: mobile POS line subtotal, discount allocation, and receipt format match server', () => {
    for (const v of goldenVectors.lineSubtotals) {
      expect(lineSubtotal(v.quantity, v.unitPrice)).toBe(v.expected);
    }
    for (const v of goldenVectors.discounts) {
      const res = applyDiscount(v.subtotal, {
        type: v.discount.type as 'AMOUNT' | 'PERCENT',
        value: v.discount.value,
      });
      expect(res.discountAmount).toBe(v.expectedDiscountAmount);
      expect(res.total).toBe(v.expectedTotal);
    }
    const alloc = allocateDiscount(
      goldenVectors.unevenDiscountAllocation.lineSubtotals,
      goldenVectors.unevenDiscountAllocation.discountAmount,
    );
    expect(alloc).toEqual(goldenVectors.unevenDiscountAllocation.expectedLines);
    expect(sumMoney(alloc.map((a) => a.allocatedDiscount))).toBe('10.00');
    expect(formatReceiptNo('20261114', 7)).toBe('RCP-20261114-0007');
  });

  it('BR-C1..BR-C6, BR-PAY1, BR-PAY2, BR-R2, BR-G3, BR-RP10: mobile costing, returns, status, and periodBounds match server', () => {
    for (const v of goldenVectors.weightedAverage) {
      expect(
        weightedAverage(v.currentQty, v.currentAvgCost, v.addedQty, v.addedUnitCost),
      ).toBe(v.expected);
    }
    expect(lineCogs('3', '108.5714')).toBe('325.71');
    expect(costAfterAdjustment('108.5714', 'DAMAGED')).toBe('108.5714');

    for (const v of goldenVectors.saleFinancials) {
      expect(
        deriveSaleFinancials({
          total: v.total,
          returnedValue: v.returnedValue,
          status: v.status as 'COMPLETED' | 'CANCELLED',
          payments: v.payments.map((p) => ({
            kind: p.kind as 'SALE_PAYMENT' | 'SALE_REFUND',
            amount: p.amount,
          })),
        }),
      ).toEqual(v.expected);
    }

    const r = goldenVectors.multiStepPartialReturnWithRemainder;
    const last = r.steps[2]!;
    expect(
      refundValue({
        lineNet: r.lineNet,
        lineCogs: r.lineCogs,
        soldQty: r.soldQty,
        returnQty: last.returnQty,
        alreadyReturnedQty: last.alreadyReturnedQty,
        alreadyRefundedValue: last.alreadyRefundedValue,
        alreadyReversedCogs: last.alreadyReversedCogs,
      }),
    ).toEqual({
      refundValue: last.expectedRefundValue,
      cogsReversed: last.expectedCogsReversed,
    });

    for (const v of goldenVectors.periodBoundsAsiaKarachi) {
      const b = periodBounds(
        v.period as 'today' | 'week' | 'month',
        v.timeZone,
        new Date(v.nowIso),
      );
      expect(b.startUtc.toISOString()).toBe(v.expectedStartUtcIso);
      expect(b.endUtc.toISOString()).toBe(v.expectedEndUtcIso);
    }
  });
});
