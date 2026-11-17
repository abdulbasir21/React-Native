import type { Request, Response } from 'express';
import { badRequest } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import {
  createPurchase,
  getPurchaseById,
  listPurchases,
  paySupplier,
  type CreatePurchaseInput,
} from '../services/purchaseService.js';
import type { ReportPeriod } from '../shared/calculations.js';

export async function listPurchasesController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    supplierId?: string;
    search?: string;
    period?: ReportPeriod;
    from?: string;
    to?: string;
  };
  const result = await listPurchases(shopId, q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function getPurchaseController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const purchase = await getPurchaseById(shopId, String(req.params.id));
  sendSuccess(res, purchase, 200);
}

export async function createPurchaseController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as Omit<CreatePurchaseInput, 'idempotencyKey'> & {
    idempotencyKey?: string;
  };
  const headerKey = req.header('Idempotency-Key')?.trim();
  const idempotencyKey = headerKey || body.idempotencyKey?.trim() || '';
  if (!idempotencyKey) {
    throw badRequest('Idempotency-Key header is required', [{ field: 'Idempotency-Key' }]);
  }

  const result = await createPurchase(shopId, {
    ...body,
    idempotencyKey,
  });

  sendSuccess(res, result.purchase, result.idempotentReplay ? 200 : 201);
}

export async function paySinglePurchaseController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const purchase = await getPurchaseById(shopId, String(req.params.id));
  const body = req.body as {
    amount: string;
    method: string;
    paidAt?: string;
    note?: string | null;
    paymentId?: string;
  };
  const result = await paySupplier(shopId, purchase.supplierId, {
    amount: body.amount,
    method: body.method,
    paidAt: body.paidAt,
    note: body.note,
    purchaseId: purchase.id,
    paymentIds: body.paymentId ? [body.paymentId] : undefined,
  });
  sendSuccess(res, result, 201);
}
