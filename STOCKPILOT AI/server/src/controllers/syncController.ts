import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { processSyncPull, processSyncPush } from '../services/syncService.js';

const syncOperationSchema = z
  .object({
    id: z.string().uuid(),
    operationType: z.enum([
      'CREATE_PRODUCT',
      'UPDATE_PRODUCT',
      'ARCHIVE_PRODUCT',
      'ADJUST_STOCK',
      'CREATE_CUSTOMER',
      'CREATE_SUPPLIER',
      'CREATE_PURCHASE',
      'CREATE_SALE',
      'CREATE_EXPENSE',
      'UPDATE_EXPENSE',
    ]),
    entityId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(128),
    payload: z.record(z.unknown()),
  })
  .strict();

const syncPushBodySchema = z
  .object({
    operations: z.array(syncOperationSchema).max(200),
  })
  .strict();

const syncPullQuerySchema = z
  .object({
    since: z.string().datetime().optional(),
  })
  .strict();

export async function syncPushController(req: Request, res: Response) {
  const parsed = syncPushBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? 'Invalid sync push payload',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const result = await processSyncPush(req.auth!.shopId, parsed.data.operations);
  sendSuccess(res, result);
}

export async function syncPullController(req: Request, res: Response) {
  const parsed = syncPullQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? 'Invalid sync pull query',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const result = await processSyncPull(req.auth!.shopId, parsed.data.since);
  sendSuccess(res, result);
}
