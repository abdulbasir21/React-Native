import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLocalExpense,
  createLocalProduct,
  createLocalPurchase,
  createLocalSale,
  getLocalSyncState,
  listLocalOutboxEntries,
} from '../db/localServices';
import { getLocalDb, resetLocalDbForTests } from '../db/sqlite';
import {
  costToMicro,
  intToMoney,
  microToCost,
  milliToQty,
  moneyToInt,
  qtyToMilli,
} from '../db/sqliteMath';
import {
  canSetLastSuccessfulSyncAt,
  computeRetryTransition,
  MAX_SYNC_ATTEMPTS,
  resolveServerPushOutcome,
  RETRY_DELAYS_MS,
  selectRunnableOutboxEntries,
  validateDiscardOutboxEntry,
  type OutboxEntry,
} from '../sync/outboxStateMachine';

const SHOP_ID = '11111111-1111-4111-8111-111111111111';

describe('Phase 7a — Local SQLite schema, atomic transactions & sync outbox state machine', () => {
  beforeEach(async () => {
    await resetLocalDbForTests(':memory:');
  });

  it('BR-G1, BR-SY1, BR-SY2: integer money/qty/cost storage and atomic local sale + outbox write with rollback on failure', async () => {
    expect(intToMoney(moneyToInt('1234.56'))).toBe('1234.56');
    expect(milliToQty(qtyToMilli('2.375'))).toBe('2.375');
    expect(microToCost(costToMicro('99.1234'))).toBe('99.1234');

    const prod = await createLocalProduct(SHOP_ID, {
      name: 'USB-C Cable',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '250.00',
      initialQuantity: '5',
      minStockLevel: '1',
    });

    // Local sale of 2 units with 50.00 discount -> subtotal 500.00, total 450.00, paid 450.00
    const saleRes = await createLocalSale(SHOP_ID, {
      idempotencyKey: 'local-sale-1',
      discount: { type: 'AMOUNT', value: '50.00' },
      paymentMethod: 'CASH',
      amountReceived: '450.00',
      items: [{ productId: prod.id, quantity: '2' }],
    });

    const db = await getLocalDb();
    const saleRow = await db.getFirstAsync<{ total_cents: number; status: string }>(
      'SELECT total_cents, status FROM sales WHERE id = ?',
      saleRes.id,
    );
    expect(saleRow?.total_cents).toBe(45000);
    expect(saleRow?.status).toBe('COMPLETED');

    const prodRow = await db.getFirstAsync<{ quantity_milli: number }>(
      'SELECT quantity_milli FROM products WHERE id = ?',
      prod.id,
    );
    expect(milliToQty(prodRow!.quantity_milli)).toBe('3.000');

    const outbox = await listLocalOutboxEntries(SHOP_ID);
    expect(outbox).toHaveLength(2);
    expect(outbox.map((o) => o.operationType)).toEqual(['CREATE_PRODUCT', 'CREATE_SALE']);
    expect(outbox.map((o) => o.seq)).toEqual([1, 2]);

    // Rollback on failure (BR-S6: insufficient stock 10 > 3 available)
    await expect(
      createLocalSale(SHOP_ID, {
        idempotencyKey: 'local-sale-fail',
        paymentMethod: 'CASH',
        amountReceived: '2500.00',
        items: [{ productId: prod.id, quantity: '10' }],
      }),
    ).rejects.toThrow('Insufficient stock');

    // Outbox & product quantity untouched after rollback
    expect(await listLocalOutboxEntries(SHOP_ID)).toHaveLength(2);
    const prodAfterFail = await db.getFirstAsync<{ quantity_milli: number }>(
      'SELECT quantity_milli FROM products WHERE id = ?',
      prod.id,
    );
    expect(milliToQty(prodAfterFail!.quantity_milli)).toBe('3.000');
  });

  it('BR-C1, BR-C2, BR-SY2: local purchase updates weighted average and writes expense & outbox atomically', async () => {
    const db = await getLocalDb();
    const supId = '22222222-2222-4222-8222-222222222222';
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO suppliers (id, shop_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      supId,
      SHOP_ID,
      'Local Sup',
      now,
      now,
    );

    const prod = await createLocalProduct(SHOP_ID, {
      name: 'Adapter',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '180.00',
      initialQuantity: '2',
    });

    await createLocalPurchase(SHOP_ID, {
      supplierId: supId,
      idempotencyKey: 'local-pur-1',
      amountPaid: '400.00',
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, quantity: '2', unitCost: '200.00' }],
    });

    // Weighted average: (2 * 100 + 2 * 200) / 4 = 150.0000
    const row = await db.getFirstAsync<{ quantity_milli: number; average_cost_micro: number }>(
      'SELECT quantity_milli, average_cost_micro FROM products WHERE id = ?',
      prod.id,
    );
    expect(milliToQty(row!.quantity_milli)).toBe('4.000');
    expect(microToCost(row!.average_cost_micro)).toBe('150.0000');

    await createLocalExpense(SHOP_ID, {
      title: 'Electricity',
      category: 'ELECTRICITY',
      amount: '1500.00',
      expenseDate: now,
      paymentMethod: 'CASH',
    });

    const outbox = await listLocalOutboxEntries(SHOP_ID);
    expect(outbox.map((o) => o.operationType)).toEqual([
      'CREATE_PRODUCT',
      'CREATE_PURCHASE',
      'CREATE_EXPENSE',
    ]);

    const syncState = await getLocalSyncState(SHOP_ID);
    expect(syncState.nextSeq).toBe(4);
  });

  it('BR-SY3, BR-SY4, BR-SY5, BR-SY6, BR-SY8: outbox ordering, dependency blocking, retry backoff, 8th failure NEEDS_REVIEW, duplicate & discard', () => {
    const baseTime = 1_000_000;

    // BR-SY4: retry schedule 5s, 30s, 2m, 10m, 1h, capped at 1h, 8th -> NEEDS_REVIEW
    expect(RETRY_DELAYS_MS).toEqual([5_000, 30_000, 120_000, 600_000, 3_600_000]);
    expect(MAX_SYNC_ATTEMPTS).toBe(8);

    const t1 = computeRetryTransition(0, baseTime, 'net err');
    expect(t1).toEqual({
      nextAttempts: 1,
      status: 'FAILED',
      nextRetryAt: baseTime + 5_000,
      lastError: 'net err',
    });
    const t2 = computeRetryTransition(1, baseTime, 'net err');
    expect(t2.nextRetryAt).toBe(baseTime + 30_000);
    const t3 = computeRetryTransition(2, baseTime, 'net err');
    expect(t3.nextRetryAt).toBe(baseTime + 120_000);
    const t4 = computeRetryTransition(3, baseTime, 'net err');
    expect(t4.nextRetryAt).toBe(baseTime + 600_000);
    const t5 = computeRetryTransition(4, baseTime, 'net err');
    expect(t5.nextRetryAt).toBe(baseTime + 3_600_000);
    const t6 = computeRetryTransition(5, baseTime, 'net err');
    expect(t6.nextRetryAt).toBe(baseTime + 3_600_000);
    const t8 = computeRetryTransition(7, baseTime, 'still failing');
    expect(t8).toEqual({
      nextAttempts: 8,
      status: 'NEEDS_REVIEW',
      nextRetryAt: null,
      lastError: 'still failing',
    });

    // BR-SY5: DUPLICATE counts as SYNCED
    const dupRes = resolveServerPushOutcome({ attempts: 1 }, { kind: 'DUPLICATE' }, baseTime);
    expect(dupRes.status).toBe('SYNCED');

    // BR-SY3: dependency blocking when parent product creation failed
    const entries: OutboxEntry[] = [
      {
        id: 'ob-1',
        seq: 1,
        shopId: SHOP_ID,
        operationType: 'CREATE_PRODUCT',
        entityType: 'product',
        entityId: 'prod-1',
        dependsOnEntityId: null,
        idempotencyKey: 'k1',
        payloadJson: '{}',
        status: 'FAILED',
        attempts: 1,
        lastError: 'timeout',
        nextRetryAt: baseTime + 5_000,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'ob-2',
        seq: 2,
        shopId: SHOP_ID,
        operationType: 'CREATE_SALE',
        entityType: 'sale',
        entityId: 'sale-1',
        dependsOnEntityId: 'prod-1',
        idempotencyKey: 'k2',
        payloadJson: '{}',
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
        createdAt: '2026-10-01T00:01:00Z',
        updatedAt: '2026-10-01T00:01:00Z',
      },
      {
        id: 'ob-3',
        seq: 3,
        shopId: SHOP_ID,
        operationType: 'CREATE_EXPENSE',
        entityType: 'expense',
        entityId: 'exp-1',
        dependsOnEntityId: null,
        idempotencyKey: 'k3',
        payloadJson: '{}',
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        nextRetryAt: null,
        createdAt: '2026-10-01T00:02:00Z',
        updatedAt: '2026-10-01T00:02:00Z',
      },
    ];

    const sel = selectRunnableOutboxEntries(entries, baseTime + 1_000);
    expect(sel.blockedIds).toEqual(['ob-2']);
    expect(sel.runnable.map((r) => r.id)).toEqual(['ob-3']);

    // BR-SY6: discard requires explicit confirmation
    expect(
      validateDiscardOutboxEntry({ id: 'ob-1', status: 'NEEDS_REVIEW', operationType: 'CREATE_SALE' }, false)
        .allowed,
    ).toBe(false);
    expect(
      validateDiscardOutboxEntry({ id: 'ob-1', status: 'NEEDS_REVIEW', operationType: 'CREATE_SALE' }, true)
        .allowed,
    ).toBe(true);

    // BR-SY8: lastSuccessfulSyncAt only when clean & pulled
    expect(canSetLastSuccessfulSyncAt([{ status: 'SYNCED' }, { status: 'PENDING' }], true)).toBe(
      false,
    );
    expect(canSetLastSuccessfulSyncAt([{ status: 'SYNCED' }], false)).toBe(false);
    expect(canSetLastSuccessfulSyncAt([{ status: 'SYNCED' }], true)).toBe(true);
  });
});
