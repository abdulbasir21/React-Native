import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { previewSaleReturn, validateCancelConfirmation } from '../lib/saleReturnHelpers';
import { customerRepository } from '../repositories/customerRepository';
import { saleRepository, type SaleDTO } from '../repositories/saleRepository';

function makeSampleSale(overrides?: Partial<SaleDTO>): SaleDTO {
  return {
    id: 'sale-1',
    shopId: 'shop-1',
    customerId: 'cust-1',
    customer: { id: 'cust-1', name: 'Ali', phone: null, archivedAt: null },
    receiptNo: 'RCP-20261114-0001',
    status: 'COMPLETED',
    subtotal: '3000.00',
    discountAmount: '100.00',
    total: '2900.00',
    returnedValue: '0.00',
    netTotal: '2900.00',
    amountPaid: '2500.00',
    balanceDue: '400.00',
    paymentMethod: 'CASH',
    paymentStatus: 'PARTIAL',
    idempotencyKey: 'k1',
    occurredAt: '2026-11-14T10:00:00.000Z',
    cancelledAt: null,
    cancelReason: null,
    note: null,
    warnings: [],
    createdAt: '2026-11-14T10:00:00.000Z',
    items: [
      {
        id: 'si-1',
        saleId: 'sale-1',
        productId: 'p1',
        productNameSnapshot: 'Earbuds',
        unitSnapshot: 'PIECE',
        quantity: '3',
        returnedQuantity: '0',
        unitPrice: '1000.00',
        lineSubtotal: '3000.00',
        allocatedDiscount: '100.00',
        lineNet: '2900.00',
        unitCostSnapshot: '600.0000',
        lineCogs: '1800.00',
        createdAt: '2026-11-14T10:00:00.000Z',
      },
    ],
    returns: [],
    payments: [
      {
        id: 'pay-1',
        shopId: 'shop-1',
        kind: 'SALE_PAYMENT',
        direction: 'IN',
        method: 'CASH',
        amount: '2500.00',
        paidAt: '2026-11-14T10:00:00.000Z',
        saleId: 'sale-1',
        purchaseId: null,
        note: null,
        createdAt: '2026-11-14T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('Phase 5b — Mobile return/cancel confirmation logic & payment allocation endpoints', () => {
  it('BR-R1, BR-R2, BR-R4: previewSaleReturn computes exact refund, excess cash refund, and rejects over-return', () => {
    const sale = makeSampleSale();

    // Return 1 of 3 -> 966.67, netTotalAfter = 1933.33, paid = 2500 -> excess = 566.67
    const partial = previewSaleReturn(sale, { 'si-1': '1' }, 'Defective unit');
    expect(partial.valid).toBe(true);
    expect(partial.totalRefundValue).toBe('966.67');
    expect(partial.excessCashRefund).toBe('566.67');
    expect(partial.requiresRefundMethod).toBe(true);

    // Over-return rejected
    const over = previewSaleReturn(sale, { 'si-1': '4' }, 'Too many');
    expect(over.valid).toBe(false);
    expect(over.error).toMatch(/exceeds remaining/i);

    // Missing reason rejected
    const noReason = previewSaleReturn(sale, { 'si-1': '1' }, '   ');
    expect(noReason.valid).toBe(false);
  });

  it('BR-R5: validateCancelConfirmation requires reason and blocks cancelled or returned sales', () => {
    const sale = makeSampleSale();
    expect(validateCancelConfirmation(sale, '').allowed).toBe(false);
    expect(validateCancelConfirmation(sale, 'Customer cancelled')).toEqual({
      allowed: true,
      error: null,
      refundAmount: '2500.00',
    });

    expect(
      validateCancelConfirmation(makeSampleSale({ status: 'CANCELLED' }), 'Reason').allowed,
    ).toBe(false);
    expect(
      validateCancelConfirmation(makeSampleSale({ returnedValue: '500.00' }), 'Reason').allowed,
    ).toBe(false);
  });

  it('BR-PAY3: repositories send valid return, cancel & customer receive-payment requests', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { data: {} } } as never);

    await saleRepository.createReturn('sale-1', {
      reason: 'Broken',
      refundMethod: 'CASH',
      items: [{ saleItemId: 'si-1', quantity: '1' }],
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/sales/sale-1/returns',
      expect.objectContaining({ reason: 'Broken', refundMethod: 'CASH' }),
    );

    await saleRepository.cancel('sale-1', { reason: 'Wrong order', refundMethod: 'CASH' });
    expect(postSpy).toHaveBeenCalledWith(
      '/sales/sale-1/cancel',
      expect.objectContaining({ reason: 'Wrong order', refundMethod: 'CASH' }),
    );

    await customerRepository.receivePayment('cust-1', {
      amount: '1500.00',
      method: 'EASYPAISA',
      allocationCount: 2,
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/customers/cust-1/receive-payment',
      expect.objectContaining({ amount: '1500.00', method: 'EASYPAISA' }),
    );

    postSpy.mockRestore();
  });
});
