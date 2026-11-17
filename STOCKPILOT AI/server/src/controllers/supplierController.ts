import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import {
  listPurchases,
  listSupplierPayments,
  paySupplier,
} from '../services/purchaseService.js';
import {
  archiveSupplier,
  createSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
} from '../services/supplierService.js';

export async function listSuppliersController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    includeArchived?: boolean;
  };
  const result = await listSuppliers(shopId, q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function getSupplierController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const supplier = await getSupplierById(shopId, String(req.params.id));
  sendSuccess(res, supplier, 200);
}

export async function createSupplierController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const supplier = await createSupplier(
    shopId,
    req.body as {
      id?: string;
      name: string;
      phone?: string | null;
      address?: string | null;
      notes?: string | null;
    },
  );
  sendSuccess(res, supplier, 201);
}

export async function updateSupplierController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const supplier = await updateSupplier(
    shopId,
    String(req.params.id),
    req.body as {
      name?: string;
      phone?: string | null;
      address?: string | null;
      notes?: string | null;
    },
  );
  sendSuccess(res, supplier, 200);
}

export async function archiveSupplierController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const supplier = await archiveSupplier(shopId, String(req.params.id));
  sendSuccess(res, supplier, 200);
}

export async function paySupplierController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const body = req.body as {
    amount: string;
    method: string;
    paidAt?: string;
    note?: string | null;
    purchaseId?: string;
    paymentIds?: string[];
  };
  const result = await paySupplier(shopId, String(req.params.id), body);
  sendSuccess(res, result, 201);
}

export async function listSupplierPaymentsController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as { page: number; pageSize: number };
  const result = await listSupplierPayments(shopId, String(req.params.id), q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function listSupplierPurchasesController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const supplierId = String(req.params.id);
  await getSupplierById(shopId, supplierId);
  const q = req.query as unknown as { page: number; pageSize: number };
  const result = await listPurchases(shopId, { ...q, supplierId });
  sendSuccess(res, result.items, 200, result.meta);
}
