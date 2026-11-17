import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLocalProduct,
  createLocalSale,
  getLocalSyncState,
  listLocalOutboxEntries,
} from '../db/localServices';
import { getLocalDb, resetLocalDbForTests } from '../db/sqlite';
import { microToCost, milliToQty } from '../db/sqliteMath';
import {
  discardOutboxEntry,
  retryOutboxEntry,
  runSyncCycle,
  type SyncPullPayloadDTO,
  type SyncTransport,
} from '../sync/syncEngine';

const SHOP_ID = '11111111-1111-4111-8111-111111111111';

describe('Phase 7b — Mobile SyncEngine push/pull, server truth overwrite & auth pause', () => {
  beforeEach(async () => {
    await resetLocalDbForTests(':memory:');
  });

  it('BR-SY5, BR-SY7, BR-SY8, BR-SY10: pushes offline product+sale, pulls server stock & averageCost truth, and sets lastSuccessfulSyncAt', async () => {
    const prod = await createLocalProduct(SHOP_ID, {
      name: 'Tempered Glass',
      unit: 'PIECE',
      purchaseCost: '50.00',
      sellingPrice: '150.00',
      initialQuantity: '10',
    });

    await createLocalSale(SHOP_ID, {
      idempotencyKey: 'off-sale-1',
      paymentMethod: 'CASH',
      amountReceived: '300.00',
      items: [{ productId: prod.id, quantity: '2' }],
    });

    const pullPayload: SyncPullPayloadDTO = {
      serverTime: '2026-10-16T12:00:00.000Z',
      categories: [],
      products: [
        {
          id: prod.id,
          shopId: SHOP_ID,
          categoryId: null,
          name: 'Tempered Glass',
          sku: null,
          description: null,
          unit: 'PIECE',
          purchaseCost: '50.00',
          lastPurchaseCost: '55.00',
          sellingPrice: '150.00',
          // Server says stock is 7 (e.g. from server adjustment) and avgCost is 52.5000 (BR-SY7)
          quantityOnHand: '7.000',
          averageCost: '52.5000',
          minStockLevel: '2.000',
          imageUri: null,
          archivedAt: null,
          createdAt: '2026-10-16T10:00:00.000Z',
          updatedAt: '2026-10-16T12:00:00.000Z',
        },
      ],
      customers: [],
      suppliers: [],
      expenses: [],
    };

    const transport: SyncTransport = {
      async push(ops) {
        return {
          serverTime: '2026-10-16T12:00:00.000Z',
          results: ops.map((o) => ({
            id: o.id,
            entityId: o.entityId,
            status: o.operationType === 'CREATE_PRODUCT' ? 'APPLIED' : 'DUPLICATE',
            warnings: o.operationType === 'CREATE_SALE' ? ['NEGATIVE_STOCK'] : [],
          })),
        };
      },
      async pull() {
        return pullPayload;
      },
    };

    const res = await runSyncCycle(SHOP_ID, transport);
    expect(res.status).toBe('SYNCED');
    expect(res.pushedCount).toBe(2);
    expect(res.warnings).toContain('NEGATIVE_STOCK');

    // BR-SY7: pull overwrote local stock & averageCost with server truth
    const db = await getLocalDb();
    const row = await db.getFirstAsync<{ quantity_milli: number; average_cost_micro: number }>(
      'SELECT quantity_milli, average_cost_micro FROM products WHERE id = ?',
      prod.id,
    );
    expect(milliToQty(row!.quantity_milli)).toBe('7.000');
    expect(microToCost(row!.average_cost_micro)).toBe('52.5000');

    // BR-SY8 & BR-SY10: initialPullCompleted and lastSuccessfulSyncAt set
    const syncState = await getLocalSyncState(SHOP_ID);
    expect(syncState.initialPullCompleted).toBe(true);
    expect(syncState.lastSuccessfulSyncAt).toBeTruthy();
  });

  it('BR-SY6: 401 pauses sync without deleting outbox; REJECTED moves entry to NEEDS_REVIEW with local data intact and discard requires confirm', async () => {
    const prod = await createLocalProduct(SHOP_ID, {
      name: 'Case',
      unit: 'PIECE',
      purchaseCost: '100.00',
      sellingPrice: '200.00',
      initialQuantity: '5',
    });

    // 401 pauses sync without deleting outbox
    const authFailTransport: SyncTransport = {
      async push() {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
      },
      async pull() {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
      },
    };

    const authRes = await runSyncCycle(SHOP_ID, authFailTransport);
    expect(authRes.status).toBe('AUTH_EXPIRED');
    const outboxAfter401 = await listLocalOutboxEntries(SHOP_ID);
    expect(outboxAfter401).toHaveLength(1);
    expect(outboxAfter401[0]!.status).toBe('PENDING');

    // REJECTED moves entry to NEEDS_REVIEW, local product stays intact
    const rejectTransport: SyncTransport = {
      async push(ops) {
        return {
          serverTime: '2026-10-16T12:00:00.000Z',
          results: ops.map((o) => ({
            id: o.id,
            entityId: o.entityId,
            status: 'REJECTED',
            warnings: [],
            error: 'Duplicate SKU',
          })),
        };
      },
      async pull() {
        return {
          serverTime: '2026-10-16T12:00:00.000Z',
          categories: [],
          products: [],
          customers: [],
          suppliers: [],
          expenses: [],
        };
      },
    };

    const rejRes = await runSyncCycle(SHOP_ID, rejectTransport);
    expect(rejRes.status).toBe('PARTIAL');

    const outboxAfterReject = await listLocalOutboxEntries(SHOP_ID);
    expect(outboxAfterReject[0]!.status).toBe('NEEDS_REVIEW');
    expect(outboxAfterReject[0]!.lastError).toBe('Duplicate SKU');

    const db = await getLocalDb();
    const localProd = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM products WHERE id = ?',
      prod.id,
    );
    expect(localProd?.id).toBe(prod.id);

    // Retry resets to PENDING
    await retryOutboxEntry(SHOP_ID, outboxAfterReject[0]!.id);
    const afterRetry = await listLocalOutboxEntries(SHOP_ID);
    expect(afterRetry[0]!.status).toBe('PENDING');

    // Discard requires explicit confirmation
    const noConfirm = await discardOutboxEntry(SHOP_ID, outboxAfterReject[0]!.id, false);
    expect(noConfirm.discarded).toBe(false);
    const confirmed = await discardOutboxEntry(SHOP_ID, outboxAfterReject[0]!.id, true);
    expect(confirmed.discarded).toBe(true);
    expect(await listLocalOutboxEntries(SHOP_ID)).toHaveLength(0);
  });
});
