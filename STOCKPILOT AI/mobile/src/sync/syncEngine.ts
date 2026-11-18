import axios from 'axios';
import { apiClient } from '../api/client';
import { getLocalSyncState, listLocalOutboxEntries } from '../db/localServices';
import { getLocalDb } from '../db/sqlite';
import { costToMicro, moneyToInt, qtyToMilli } from '../db/sqliteMath';
import {
  canSetLastSuccessfulSyncAt,
  resolveServerPushOutcome,
  selectRunnableOutboxEntries,
  validateDiscardOutboxEntry,
  type OutboxEntry,
  type ServerPushOutcome,
} from './outboxStateMachine';

export interface SyncPushOpDTO {
  id: string;
  operationType: OutboxEntry['operationType'];
  entityId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface SyncPushResultItemDTO {
  id: string;
  entityId: string;
  status: 'APPLIED' | 'DUPLICATE' | 'REJECTED';
  warnings: string[];
  error?: string;
}

export interface SyncPullPayloadDTO {
  serverTime: string;
  categories: Array<{ id: string; shopId: string; name: string; createdAt: string }>;
  products: Array<{
    id: string;
    shopId: string;
    categoryId: string | null;
    name: string;
    sku: string | null;
    description: string | null;
    unit: string;
    purchaseCost: string;
    lastPurchaseCost: string;
    sellingPrice: string;
    quantityOnHand: string;
    averageCost: string;
    minStockLevel: string;
    imageUri: string | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  customers: Array<{
    id: string;
    shopId: string;
    name: string;
    phone: string | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  suppliers: Array<{
    id: string;
    shopId: string;
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  expenses: Array<{
    id: string;
    shopId: string;
    title: string;
    category: string;
    amount: string;
    expenseDate: string;
    paymentMethod: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface SyncTransport {
  push(operations: SyncPushOpDTO[]): Promise<{ results: SyncPushResultItemDTO[]; serverTime: string }>;
  pull(since?: string | null): Promise<SyncPullPayloadDTO>;
}

export const defaultSyncTransport: SyncTransport = {
  async push(operations) {
    const res = await apiClient.post<{
      data: { results: SyncPushResultItemDTO[]; serverTime: string };
    }>('/sync/push', { operations });
    return res.data.data;
  },
  async pull(since) {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    const res = await apiClient.get<{ data: SyncPullPayloadDTO }>(`/sync/pull${qs}`);
    return res.data.data;
  },
};

function isUnauthorizedError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    return err.response?.status === 401;
  }
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status?: number }).status === 401
  );
}

export async function applyServerPullToSqlite(
  shopId: string,
  payload: SyncPullPayloadDTO,
): Promise<void> {
  const db = await getLocalDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const c of payload.categories) {
      await txn.runAsync(
        `INSERT OR REPLACE INTO categories (id, shop_id, name, created_at) VALUES (?, ?, ?, ?)`,
        c.id,
        c.shopId,
        c.name,
        c.createdAt,
      );
    }

    // BR-SY7: Server is source of truth for stock quantityOnHand and averageCost
    for (const p of payload.products) {
      await txn.runAsync(
        `INSERT OR REPLACE INTO products (
          id, shop_id, category_id, name, sku, description, unit,
          purchase_cost_cents, last_purchase_cost_cents, selling_price_cents,
          quantity_milli, average_cost_micro, min_stock_milli, image_uri,
          archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.shopId,
        p.categoryId,
        p.name,
        p.sku,
        p.description,
        p.unit,
        moneyToInt(p.purchaseCost),
        moneyToInt(p.lastPurchaseCost),
        moneyToInt(p.sellingPrice),
        qtyToMilli(p.quantityOnHand),
        costToMicro(p.averageCost),
        qtyToMilli(p.minStockLevel),
        p.imageUri,
        p.archivedAt,
        p.createdAt,
        p.updatedAt,
      );
    }

    for (const c of payload.customers) {
      await txn.runAsync(
        `INSERT OR REPLACE INTO customers (id, shop_id, name, phone, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.shopId,
        c.name,
        c.phone,
        c.archivedAt,
        c.createdAt,
        c.updatedAt,
      );
    }

    for (const s of payload.suppliers) {
      await txn.runAsync(
        `INSERT OR REPLACE INTO suppliers (id, shop_id, name, phone, address, notes, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.id,
        s.shopId,
        s.name,
        s.phone,
        s.address,
        s.notes,
        s.archivedAt,
        s.createdAt,
        s.updatedAt,
      );
    }

    for (const e of payload.expenses) {
      await txn.runAsync(
        `INSERT OR REPLACE INTO expenses (
          id, shop_id, title, category, amount_cents, expense_date,
          payment_method, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id,
        e.shopId,
        e.title,
        e.category,
        moneyToInt(e.amount),
        e.expenseDate,
        e.paymentMethod,
        e.description,
        e.createdAt,
        e.updatedAt,
      );
    }

    await txn.runAsync(
      `INSERT INTO sync_state (shop_id, last_pulled_at, last_successful_sync_at, initial_pull_completed, next_seq)
       VALUES (?, ?, NULL, 1, 1)
       ON CONFLICT(shop_id) DO UPDATE SET
         last_pulled_at = excluded.last_pulled_at,
         initial_pull_completed = 1`,
      shopId,
      payload.serverTime,
    );
  });
}

export interface SyncCycleResult {
  status: 'SYNCED' | 'PARTIAL' | 'AUTH_EXPIRED' | 'ERROR';
  pushedCount: number;
  warnings: string[];
  error?: string;
}

export async function runSyncCycle(
  shopId: string,
  transport: SyncTransport = defaultSyncTransport,
  nowMs: number = Date.now(),
): Promise<SyncCycleResult> {
  const db = await getLocalDb();
  const warnings: string[] = [];
  let pushedCount = 0;

  for (let batch = 0; batch < 20; batch += 1) {
    const entries = await listLocalOutboxEntries(shopId);
    const { runnable } = selectRunnableOutboxEntries(entries, nowMs);
    if (runnable.length === 0) {
      break;
    }

    const ops: SyncPushOpDTO[] = runnable.map((e) => ({
      id: e.id,
      operationType: e.operationType,
      entityId: e.entityId,
      idempotencyKey: e.idempotencyKey,
      payload: JSON.parse(e.payloadJson) as Record<string, unknown>,
    }));

    try {
      const pushRes = await transport.push(ops);
      const resMap = new Map(pushRes.results.map((r) => [r.id, r]));
      let progressed = 0;

      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const entry of runnable) {
          const itemRes = resMap.get(entry.id);
          if (!itemRes) continue;
          pushedCount += 1;
          if (itemRes.warnings.length > 0) {
            warnings.push(...itemRes.warnings);
          }

          const outcome: ServerPushOutcome =
            itemRes.status === 'APPLIED'
              ? { kind: 'APPLIED' }
              : itemRes.status === 'DUPLICATE'
                ? { kind: 'DUPLICATE' }
                : { kind: 'REJECTED', message: itemRes.error ?? 'Rejected by server' };

          const next = resolveServerPushOutcome(entry, outcome, nowMs);
          if (next.status === 'SYNCED') {
            progressed += 1;
          }
          await txn.runAsync(
            `UPDATE sync_outbox
             SET status = ?, attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ?
             WHERE id = ? AND shop_id = ?`,
            next.status,
            next.attempts,
            next.nextRetryAt,
            next.lastError,
            new Date(nowMs).toISOString(),
            entry.id,
            shopId,
          );
        }
      });

      if (progressed === 0) {
        break;
      }
    } catch (err) {
      if (isUnauthorizedError(err)) {
        // Token expiry pauses sync WITHOUT deleting or mutating the outbox
        return {
          status: 'AUTH_EXPIRED',
          pushedCount: 0,
          warnings,
          error: 'Session expired. Please log in again.',
        };
      }

      const msg = err instanceof Error ? err.message : 'Network error during sync push';
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const entry of runnable) {
          const next = resolveServerPushOutcome(
            entry,
            { kind: 'RETRYABLE_ERROR', message: msg },
            nowMs,
          );
          await txn.runAsync(
            `UPDATE sync_outbox
             SET status = ?, attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ?
             WHERE id = ? AND shop_id = ?`,
            next.status,
            next.attempts,
            next.nextRetryAt,
            next.lastError,
            new Date(nowMs).toISOString(),
            entry.id,
            shopId,
          );
        }
      });
      return { status: 'ERROR', pushedCount: 0, warnings, error: msg };
    }
  }

  let pullSucceeded = false;
  try {
    const syncState = await getLocalSyncState(shopId);
    const pullPayload = await transport.pull(
      syncState.initialPullCompleted ? syncState.lastPulledAt : null,
    );
    await applyServerPullToSqlite(shopId, pullPayload);
    pullSucceeded = true;
  } catch (err) {
    if (isUnauthorizedError(err)) {
      return {
        status: 'AUTH_EXPIRED',
        pushedCount,
        warnings,
        error: 'Session expired. Please log in again.',
      };
    }
    return {
      status: 'ERROR',
      pushedCount,
      warnings,
      error: err instanceof Error ? err.message : 'Sync pull failed',
    };
  }

  const finalOutbox = await listLocalOutboxEntries(shopId);
  if (canSetLastSuccessfulSyncAt(finalOutbox, pullSucceeded)) {
    const nowIso = new Date(nowMs).toISOString();
    await db.runAsync(
      'UPDATE sync_state SET last_successful_sync_at = ? WHERE shop_id = ?',
      nowIso,
      shopId,
    );
    return { status: 'SYNCED', pushedCount, warnings };
  }

  return { status: 'PARTIAL', pushedCount, warnings };
}

export async function retryOutboxEntry(shopId: string, entryId: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'PENDING', attempts = 0, next_retry_at = NULL, updated_at = ?
     WHERE id = ? AND shop_id = ?`,
    new Date().toISOString(),
    entryId,
    shopId,
  );
}

export async function discardOutboxEntry(
  shopId: string,
  entryId: string,
  confirmed: boolean,
): Promise<{ discarded: boolean; warning: string }> {
  const entries = await listLocalOutboxEntries(shopId);
  const target = entries.find((e) => e.id === entryId);
  if (!target) {
    throw new Error('Outbox entry not found');
  }
  const check = validateDiscardOutboxEntry(target, confirmed);
  if (!check.allowed) {
    return { discarded: false, warning: check.warning };
  }
  const db = await getLocalDb();
  await db.runAsync('DELETE FROM sync_outbox WHERE id = ? AND shop_id = ?', entryId, shopId);
  return { discarded: true, warning: check.warning };
}
