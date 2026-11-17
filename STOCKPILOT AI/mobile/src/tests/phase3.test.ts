import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { expenseFormSchema, expenseRepository } from '../repositories/expenseRepository';
import { purchaseRepository } from '../repositories/purchaseRepository';
import { paySupplierSchema } from '../repositories/supplierRepository';
import {
  allocateOldestFirst,
  derivePurchaseFinancials,
  isExpenseDateAllowed,
  weightedAverage,
} from '../shared/calculations';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Phase 3 — Mobile purchase costing, supplier payments & expense validation', () => {
  it('BR-C1, BR-C2, BR-PU3, BR-PU5, BR-PU6: weightedAverage, derivePurchaseFinancials, and oldest-first allocation', () => {
    // 10 @ 100 + 10 @ 120 -> 110.0000
    expect(weightedAverage('10', '100', '10', '120')).toBe('110.0000');

    const fin = derivePurchaseFinancials({
      total: '5000.00',
      payments: [{ amount: '2000.00' }],
    });
    expect(fin.amountPaid).toBe('2000.00');
    expect(fin.balanceDue).toBe('3000.00');
    expect(fin.paymentStatus).toBe('PARTIAL');

    const allocs = allocateOldestFirst(
      [
        { id: 'pur-1', balanceDue: '3000.00' },
        { id: 'pur-2', balanceDue: '4000.00' },
      ],
      '4500.00',
    );
    expect(allocs).toEqual([
      { targetId: 'pur-1', amount: '3000.00' },
      { targetId: 'pur-2', amount: '1500.00' },
    ]);
  });

  it('BR-E1: expenseFormSchema rejects 0/negative amount, paySupplierSchema enforces > 0, and date window respects shop timezone', () => {
    expect(
      expenseFormSchema.safeParse({
        title: 'Rent',
        category: 'RENT',
        amount: '0',
        expenseDate: '2026-06-10T10:00:00.000Z',
        paymentMethod: 'CASH',
      }).success,
    ).toBe(false);

    expect(
      expenseFormSchema.safeParse({
        title: 'Rent',
        category: 'RENT',
        amount: '15000.00',
        expenseDate: '2026-06-10T10:00:00.000Z',
        paymentMethod: 'BANK_TRANSFER',
      }).success,
    ).toBe(true);

    expect(
      paySupplierSchema.safeParse({ amount: '0', method: 'CASH' }).success,
    ).toBe(false);

    const now = new Date('2026-06-10T18:30:00.000Z');
    expect(
      isExpenseDateAllowed(new Date('2026-06-11T17:00:00.000Z'), 'Asia/Karachi', now),
    ).toBe(true);
    expect(
      isExpenseDateAllowed(new Date('2026-06-11T19:30:00.000Z'), 'Asia/Karachi', now),
    ).toBe(false);
  });

  it('BR-G4, BR-PU8: purchaseRepository.create and expenseRepository.create send client UUIDs and Idempotency-Key', async () => {
    const postSpy = vi
      .spyOn(apiClient, 'post')
      .mockImplementation(async (_url: string, body?: unknown) => ({
        data: { success: true, data: body },
      }) as never);

    await purchaseRepository.create({
      supplierId: '11111111-1111-4111-8111-111111111111',
      amountPaid: '1200.00',
      paymentMethod: 'CASH',
      items: [
        {
          productId: '22222222-2222-4222-8222-222222222222',
          quantity: '10',
          unitCost: '120',
        },
      ],
    });

    const purchasePayload = postSpy.mock.calls[0]![1] as {
      id: string;
      idempotencyKey: string;
      paymentId?: string;
      items: Array<{ id: string; movementId: string }>;
    };
    const purchaseConfig = postSpy.mock.calls[0]![2] as {
      headers: Record<string, string>;
    };

    expect(purchasePayload.id).toMatch(UUID_REGEX);
    expect(purchasePayload.idempotencyKey).toMatch(UUID_REGEX);
    expect(purchasePayload.paymentId).toMatch(UUID_REGEX);
    expect(purchasePayload.items[0]!.id).toMatch(UUID_REGEX);
    expect(purchasePayload.items[0]!.movementId).toMatch(UUID_REGEX);
    expect(purchaseConfig.headers['Idempotency-Key']).toBe(purchasePayload.idempotencyKey);

    await expenseRepository.create({
      title: 'Electricity',
      category: 'ELECTRICITY',
      amount: '4500',
      expenseDate: '2026-06-10T12:00:00.000Z',
      paymentMethod: 'CASH',
    });

    const expensePayload = postSpy.mock.calls[1]![1] as { id: string };
    expect(expensePayload.id).toMatch(UUID_REGEX);

    postSpy.mockRestore();
  });
});
