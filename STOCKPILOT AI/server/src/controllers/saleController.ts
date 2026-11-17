import type { Request, Response } from 'express';
import { badRequest } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import { cancelSale } from '../services/cancelService.js';
import { createSaleReturn, type CreateSaleReturnInput } from '../services/returnService.js';
import {
  addSalePayment,
  createSale,
  getSaleById,
  getSaleReceiptData,
  listSales,
  type CreateSaleInput,
} from '../services/saleService.js';
import type { ReportPeriod } from '../shared/calculations.js';
import type { SaleStatus } from '../shared/enums.js';

export async function listSalesController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    status?: SaleStatus;
    paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | 'NOT_APPLICABLE';
    customerId?: string;
    period?: ReportPeriod;
    from?: string;
    to?: string;
  };
  const result = await listSales(shopId, {
    page: q.page,
    pageSize: q.pageSize,
    search: q.search,
    status: q.status,
    paymentStatus: q.paymentStatus,
    customerId: q.customerId,
    period: q.period,
    fromDate: q.from,
    toDate: q.to,
  });
  sendSuccess(res, result.items, 200, result.meta);
}

export async function createSaleController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as Omit<CreateSaleInput, 'idempotencyKey'> & {
    idempotencyKey?: string;
  };
  const headerKey = req.header('Idempotency-Key')?.trim();
  const idempotencyKey = headerKey || body.idempotencyKey?.trim() || '';
  if (!idempotencyKey) {
    throw badRequest('Idempotency-Key header is required', [{ field: 'Idempotency-Key' }]);
  }

  const result = await createSale(shopId, {
    ...body,
    idempotencyKey,
  });

  sendSuccess(res, result.sale, result.idempotentReplay ? 200 : 201);
}

export async function getSaleController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const sale = await getSaleById(shopId, String(req.params.id));
  sendSuccess(res, sale, 200);
}

export async function getSaleReceiptController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const receipt = await getSaleReceiptData(shopId, String(req.params.id));
  sendSuccess(res, receipt, 200);
}

export async function addSalePaymentController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as {
    id?: string;
    amount: string;
    method: string;
    paidAt?: string;
    note?: string | null;
  };
  const sale = await addSalePayment(shopId, String(req.params.id), body);
  sendSuccess(res, sale, 201);
}

export async function createSaleReturnController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as CreateSaleReturnInput;
  const result = await createSaleReturn(shopId, String(req.params.id), body);
  sendSuccess(res, result, 201);
}

export async function cancelSaleController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as {
    reason: string;
    refundMethod?: string | null;
    occurredAt?: string;
    paymentId?: string;
  };
  const sale = await cancelSale(shopId, String(req.params.id), body);
  sendSuccess(res, sale, 200);
}
