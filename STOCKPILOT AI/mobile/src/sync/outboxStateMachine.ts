export type OutboxStatus = 'PENDING' | 'IN_FLIGHT' | 'FAILED' | 'NEEDS_REVIEW' | 'SYNCED';

export type OutboxOperationType =
  | 'CREATE_PRODUCT'
  | 'UPDATE_PRODUCT'
  | 'ARCHIVE_PRODUCT'
  | 'ADJUST_STOCK'
  | 'CREATE_CUSTOMER'
  | 'CREATE_SUPPLIER'
  | 'CREATE_PURCHASE'
  | 'CREATE_SALE'
  | 'CREATE_EXPENSE'
  | 'UPDATE_EXPENSE';

export interface OutboxEntry {
  id: string;
  seq: number;
  shopId: string;
  operationType: OutboxOperationType;
  entityType: string;
  entityId: string;
  dependsOnEntityId: string | null;
  idempotencyKey: string;
  payloadJson: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  nextRetryAt: number | null;
  createdAt: string;
  updatedAt: string;
}

export const RETRY_DELAYS_MS = [
  5_000, // 1st failure: 5s
  30_000, // 2nd failure: 30s
  120_000, // 3rd failure: 2m
  600_000, // 4th failure: 10m
  3_600_000, // 5th+ failure: 1h
] as const;

export const MAX_SYNC_ATTEMPTS = 8;

export function getRetryDelayMs(attemptNumber: number): number {
  const index = Math.max(0, Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index]!;
}

export function computeRetryTransition(
  previousAttempts: number,
  nowMs: number,
  errorMessage: string,
): {
  nextAttempts: number;
  status: 'FAILED' | 'NEEDS_REVIEW';
  nextRetryAt: number | null;
  lastError: string;
} {
  const nextAttempts = previousAttempts + 1;
  if (nextAttempts >= MAX_SYNC_ATTEMPTS) {
    return {
      nextAttempts,
      status: 'NEEDS_REVIEW',
      nextRetryAt: null,
      lastError: errorMessage,
    };
  }
  const delay = getRetryDelayMs(nextAttempts);
  return {
    nextAttempts,
    status: 'FAILED',
    nextRetryAt: nowMs + delay,
    lastError: errorMessage,
  };
}

export type ServerPushOutcome =
  | { kind: 'APPLIED' }
  | { kind: 'DUPLICATE' }
  | { kind: 'RETRYABLE_ERROR'; message: string }
  | { kind: 'REJECTED'; message: string };

export function resolveServerPushOutcome(
  entry: Pick<OutboxEntry, 'attempts'>,
  outcome: ServerPushOutcome,
  nowMs: number,
): {
  status: OutboxStatus;
  attempts: number;
  nextRetryAt: number | null;
  lastError: string | null;
} {
  if (outcome.kind === 'APPLIED' || outcome.kind === 'DUPLICATE') {
    return {
      status: 'SYNCED',
      attempts: entry.attempts,
      nextRetryAt: null,
      lastError: null,
    };
  }
  if (outcome.kind === 'REJECTED') {
    return {
      status: 'NEEDS_REVIEW',
      attempts: entry.attempts + 1,
      nextRetryAt: null,
      lastError: outcome.message,
    };
  }
  const transition = computeRetryTransition(entry.attempts, nowMs, outcome.message);
  return {
    status: transition.status,
    attempts: transition.nextAttempts,
    nextRetryAt: transition.nextRetryAt,
    lastError: transition.lastError,
  };
}

export interface OutboxSelectionResult {
  runnable: OutboxEntry[];
  blockedIds: string[];
}

/**
 * BR-SY3: Preserves creation order (seq) and blocks dependent entries whose
 * parent entity has an unsynced / failed / needs-review earlier operation.
 */
export function selectRunnableOutboxEntries(
  entries: readonly OutboxEntry[],
  nowMs: number,
): OutboxSelectionResult {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const unsyncedEntities = new Set<string>();
  const runnable: OutboxEntry[] = [];
  const blockedIds: string[] = [];

  for (const entry of sorted) {
    if (entry.status === 'SYNCED') {
      continue;
    }

    const parentBlocked =
      entry.dependsOnEntityId !== null && unsyncedEntities.has(entry.dependsOnEntityId);

    unsyncedEntities.add(entry.entityId);

    if (parentBlocked) {
      blockedIds.push(entry.id);
      continue;
    }

    if (entry.status === 'NEEDS_REVIEW' || entry.status === 'IN_FLIGHT') {
      continue;
    }

    if (entry.status === 'FAILED' && entry.nextRetryAt !== null && entry.nextRetryAt > nowMs) {
      continue;
    }

    runnable.push(entry);
  }

  return { runnable, blockedIds };
}

/**
 * BR-SY8: lastSuccessfulSyncAt is set ONLY when the outbox has no pending/failed/review entries
 * and the server pull succeeded.
 */
export function canSetLastSuccessfulSyncAt(
  entries: readonly Pick<OutboxEntry, 'status'>[],
  pullSucceeded: boolean,
): boolean {
  if (!pullSucceeded) return false;
  return entries.every((e) => e.status === 'SYNCED');
}

/**
 * BR-SY6: Discarding a NEEDS_REVIEW entry requires explicit confirmation and warns about data loss.
 */
export function validateDiscardOutboxEntry(
  entry: Pick<OutboxEntry, 'id' | 'status' | 'operationType'>,
  confirmed: boolean,
): { allowed: boolean; warning: string } {
  const warning = `Discarding ${entry.operationType} will permanently remove it from the sync queue and related local offline data may be lost.`;
  if (!confirmed) {
    return { allowed: false, warning };
  }
  return { allowed: true, warning };
}
