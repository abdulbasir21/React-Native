import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import {
  archiveCustomer,
  createCustomer,
  getCustomerById,
  listCustomerPayments,
  listCustomers,
  listCustomerSales,
  receiveCustomerPayment,
  updateCustomer,
} from '../services/customerService.js';

export async function listCustomersController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    includeArchived?: boolean;
  };
  const result = await listCustomers(shopId, q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function getCustomerController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const customer = await getCustomerById(shopId, String(req.params.id));
  sendSuccess(res, customer, 200);
}

export async function createCustomerController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const customer = await createCustomer(
    shopId,
    req.body as { id?: string; name: string; phone?: string | null },
  );
  sendSuccess(res, customer, 201);
}

export async function updateCustomerController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const customer = await updateCustomer(
    shopId,
    String(req.params.id),
    req.body as { name?: string; phone?: string | null },
  );
  sendSuccess(res, customer, 200);
}

export async function archiveCustomerController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const customer = await archiveCustomer(shopId, String(req.params.id));
  sendSuccess(res, customer, 200);
}

export async function receiveCustomerPaymentController(
  req: Request,
  res: Response,
): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as {
    amount: string;
    method: string;
    paidAt?: string;
    note?: string | null;
    paymentIds?: string[];
  };
  const result = await receiveCustomerPayment(shopId, String(req.params.id), body);
  sendSuccess(res, result, 201);
}

export async function listCustomerSalesController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const sales = await listCustomerSales(shopId, String(req.params.id));
  sendSuccess(res, sales, 200);
}

export async function listCustomerPaymentsController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const payments = await listCustomerPayments(shopId, String(req.params.id));
  sendSuccess(res, payments, 200);
}
