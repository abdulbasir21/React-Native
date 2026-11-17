import { describe, expect, it } from 'vitest';
import {
  allocateDiscount,
  applyDiscount,
  costAfterAdjustment,
  customDateRangeBounds,
  derivePurchaseFinancials,
  deriveSaleFinancials,
  formatReceiptNo,
  lineCogs,
  lineSubtotal,
  periodBounds,
  refundValue,
  weightedAverage,
} from '../shared/calculations.js';
import {
  AI_ACTION_STATUSES,
  EXPENSE_CATEGORIES,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SALE_STATUSES,
  SHOP_TYPES,
  STOCK_MOVEMENT_TYPES,
  UNITS,
} from '../shared/enums.js';
import goldenVectors from '../shared/golden-vectors.json' with { type: 'json' };
import {
  addMoney,
  formatMoneyWithCurrency,
  fromCostInt,
  fromPaisa,
  fromThousandths,
  round2,
  round4,
  subMoney,
  sumMoney,
  toCostInt,
  toPaisa,
  toThousandths,
  validateQuantityForUnit,
} from '../shared/money.js';

describe('Phase 1a — Pure Functions and Golden Vectors', () => {
  it('BR-G1: exact decimal money arithmetic avoids floating-point drift and converts SQLite integers cleanly', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(subMoney('1000.00', '0.01')).toBe('999.99');
    expect(sumMoney(['19.99', '0.01', '100.00'])).toBe('120.00');
    expect(formatMoneyWithCurrency('48650.00', 'PKR')).toBe('Rs. 48,650');
    expect(formatMoneyWithCurrency('48650.50', 'PKR')).toBe('Rs. 48,650.50');

    expect(toPaisa('123.45')).toBe(12345);
    expect(fromPaisa(12345)).toBe('123.45');
    expect(toThousandths('1.255')).toBe(1255);
    expect(fromThousandths(1255)).toBe('1.255');
    expect(toCostInt('108.5714')).toBe(1085714);
    expect(fromCostInt(1085714)).toBe('108.5714');
    expect(() => round2(Number.NaN)).toThrow();
  });

  it('BR-G2: rounds half up to 2 decimals for money and 4 decimals for average cost without re-rounding sums', () => {
    for (const row of goldenVectors.roundingHalfUp) {
      if (row.expectedRound2) {
        expect(round2(row.input)).toBe(row.expectedRound2);
      }
      if (row.expectedRound4) {
        expect(round4(row.input)).toBe(row.expectedRound4);
      }
    }
    expect(round2('-10.005')).toBe('-10.01');
  });

  it('BR-G5 & BR-P5: enumerations match exact spec and unit validation allows decimals only for KG, LITRE, METRE', () => {
    expect(PAYMENT_METHODS).toEqual(['CASH', 'EASYPAISA', 'JAZZCASH', 'BANK_TRANSFER', 'CARD', 'CREDIT']);
    expect(PAYMENT_STATUSES).toEqual(['PAID', 'PARTIAL', 'UNPAID', 'NOT_APPLICABLE']);
    expect(SALE_STATUSES).toEqual(['COMPLETED', 'CANCELLED']);
    expect(STOCK_MOVEMENT_TYPES).toEqual([
      'INITIAL_STOCK',
      'PURCHASE',
      'SALE',
      'CUSTOMER_RETURN',
      'DAMAGED',
      'EXPIRED',
      'ADJUSTMENT',
      'SALE_CANCELLATION',
    ]);
    expect(PAYMENT_KINDS).toEqual(['SALE_PAYMENT', 'SALE_REFUND', 'PURCHASE_PAYMENT']);
    expect(EXPENSE_CATEGORIES).toEqual([
      'RENT',
      'ELECTRICITY',
      'INTERNET',
      'SALARIES',
      'TRANSPORT',
      'MAINTENANCE',
      'OTHER',
    ]);
    expect(UNITS).toEqual(['PIECE', 'PACK', 'DOZEN', 'BOX', 'KG', 'LITRE', 'METRE']);
    expect(SHOP_TYPES).toEqual([
      'GROCERY',
      'MOBILE_ACCESSORIES',
      'ELECTRONICS',
      'GENERAL_RETAIL',
      'OTHER',
    ]);
    expect(AI_ACTION_STATUSES).toEqual([
      'PENDING',
      'CONFIRMED',
      'EXECUTED',
      'REJECTED',
      'EXPIRED',
      'FAILED',
    ]);

    expect(validateQuantityForUnit('1.255', 'KG').valid).toBe(true);
    expect(validateQuantityForUnit('2.5', 'LITRE').valid).toBe(true);
    expect(validateQuantityForUnit('10.125', 'METRE').valid).toBe(true);
    expect(validateQuantityForUnit('1.2555', 'KG').valid).toBe(false);
    expect(validateQuantityForUnit('1.5', 'PIECE').valid).toBe(false);
    expect(validateQuantityForUnit('3', 'PIECE').valid).toBe(true);
    expect(validateQuantityForUnit('0', 'PIECE').valid).toBe(false);
  });

  it('BR-SA1: lineSubtotal computes round2(qty * unitPrice) and rejects invalid bounds', () => {
    for (const v of goldenVectors.lineSubtotals) {
      expect(lineSubtotal(v.quantity, v.unitPrice)).toBe(v.expected);
    }
    expect(lineSubtotal('2', '0.00')).toBe('0.00');
    expect(() => lineSubtotal('0', '100.00')).toThrow();
    expect(() => lineSubtotal('1', '-0.01')).toThrow();
  });

  it('BR-SA2: applyDiscount supports amount and percent and enforces 0 <= discount <= subtotal', () => {
    for (const v of goldenVectors.discounts) {
      const res = applyDiscount(v.subtotal, {
        type: v.discount.type as 'AMOUNT' | 'PERCENT',
        value: v.discount.value,
      });
      expect(res.discountAmount).toBe(v.expectedDiscountAmount);
      expect(res.total).toBe(v.expectedTotal);
    }
    expect(() => applyDiscount('100.00', { type: 'PERCENT', value: '101' })).toThrow();
    expect(() => applyDiscount('100.00', { type: 'AMOUNT', value: '100.01' })).toThrow();
    expect(() => applyDiscount('100.00', { type: 'AMOUNT', value: '-1' })).toThrow();
  });

  it('BR-SA3: allocateDiscount distributes across lines with last line taking remainder so allocations sum exactly', () => {
    const v = goldenVectors.unevenDiscountAllocation;
    const allocated = allocateDiscount(v.lineSubtotals, v.discountAmount);
    expect(allocated).toEqual(v.expectedLines);
    const totalAllocated = sumMoney(allocated.map((l) => l.allocatedDiscount));
    expect(totalAllocated).toBe(v.discountAmount);
  });

  it('BR-C1, BR-C2, BR-C4, BR-C6: weightedAverage handles purchases, returns, negative stock as 0, and 4-decimal rounding', () => {
    for (const v of goldenVectors.weightedAverage) {
      expect(
        weightedAverage(v.currentQty, v.currentAvgCost, v.addedQty, v.addedUnitCost),
      ).toBe(v.expected);
    }
    // BR-C4: customer return restores at unitCostSnapshot
    expect(weightedAverage('5', '110.0000', '2', '100.0000')).toBe('107.1429');
    expect(() => weightedAverage('5', '100.0000', '0', '100.00')).toThrow();
  });

  it('BR-C3 & BR-C5: lineCogs computes rounded snapshot COGS and adjustments do not alter averageCost', () => {
    expect(lineCogs('3', '108.5714')).toBe('325.71');
    expect(costAfterAdjustment('108.5714', 'DAMAGED')).toBe('108.5714');
    expect(costAfterAdjustment('108.5714', 'EXPIRED')).toBe('108.5714');
    expect(costAfterAdjustment('108.5714', 'ADJUSTMENT')).toBe('108.5714');
  });

  it('BR-SA9: formatReceiptNo formats RCP-YYYYMMDD-NNNN and rejects invalid input', () => {
    expect(formatReceiptNo('20261114', 1)).toBe('RCP-20261114-0001');
    expect(formatReceiptNo('20261114', 42)).toBe('RCP-20261114-0042');
    expect(() => formatReceiptNo('2026-11-14', 1)).toThrow();
    expect(() => formatReceiptNo('20261114', 0)).toThrow();
  });

  it('BR-PAY1 & BR-PAY2: deriveSaleFinancials and derivePurchaseFinancials compute exact balances and statuses', () => {
    for (const v of goldenVectors.saleFinancials) {
      const res = deriveSaleFinancials({
        total: v.total,
        returnedValue: v.returnedValue,
        status: v.status as 'COMPLETED' | 'CANCELLED',
        payments: v.payments.map((p) => ({
          kind: p.kind as 'SALE_PAYMENT' | 'SALE_REFUND',
          amount: p.amount,
        })),
      });
      expect(res).toEqual(v.expected);
    }

    expect(
      derivePurchaseFinancials({
        total: '10000.00',
        payments: [{ amount: '4000.00' }],
      }),
    ).toEqual({
      amountPaid: '4000.00',
      balanceDue: '6000.00',
      paymentStatus: 'PARTIAL',
    });
  });

  it('BR-R2: refundValue handles partial returns and assigns final remainder so refunds sum to lineNet', () => {
    const v = goldenVectors.multiStepPartialReturnWithRemainder;
    let sumRefunds = '0.00';
    let sumCogs = '0.00';

    for (const step of v.steps) {
      const res = refundValue({
        lineNet: v.lineNet,
        lineCogs: v.lineCogs,
        soldQty: v.soldQty,
        returnQty: step.returnQty,
        alreadyReturnedQty: step.alreadyReturnedQty,
        alreadyRefundedValue: step.alreadyRefundedValue,
        alreadyReversedCogs: step.alreadyReversedCogs,
      });
      expect(res.refundValue).toBe(step.expectedRefundValue);
      expect(res.cogsReversed).toBe(step.expectedCogsReversed);
      sumRefunds = addMoney(sumRefunds, res.refundValue);
      sumCogs = addMoney(sumCogs, res.cogsReversed);
    }

    expect(sumRefunds).toBe(v.lineNet);
    expect(sumCogs).toBe(v.lineCogs);

    expect(() =>
      refundValue({
        lineNet: '100.00',
        lineCogs: '60.00',
        soldQty: '3',
        returnQty: '2',
        alreadyReturnedQty: '2',
        alreadyRefundedValue: '66.66',
        alreadyReversedCogs: '40.00',
      }),
    ).toThrow();
  });

  it('BR-G3 & BR-RP10: periodBounds handles Asia/Karachi midnight, Monday-Sunday week, and month boundaries', () => {
    for (const v of goldenVectors.periodBoundsAsiaKarachi) {
      const bounds = periodBounds(
        v.period as 'today' | 'week' | 'month',
        v.timeZone,
        new Date(v.nowIso),
      );
      expect(bounds.startUtc.toISOString()).toBe(v.expectedStartUtcIso);
      expect(bounds.endUtc.toISOString()).toBe(v.expectedEndUtcIso);
      expect(bounds.startLocalDate).toBe(v.expectedStartLocalDate);
      expect(bounds.endLocalDate).toBe(v.expectedEndLocalDate);
    }

    const custom = customDateRangeBounds('2026-01-31', '2026-02-01', 'Asia/Karachi');
    expect(custom.startUtc.toISOString()).toBe('2026-01-30T19:00:00.000Z');
    expect(custom.endUtc.toISOString()).toBe('2026-02-01T19:00:00.000Z');
    expect(() => customDateRangeBounds('2026-02-05', '2026-02-01', 'Asia/Karachi')).toThrow();
  });
});
