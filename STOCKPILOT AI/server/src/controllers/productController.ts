import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import type { Unit } from '../shared/enums.js';
import { adjustProductStock, listProductMovements } from '../services/inventoryService.js';
import {
  archiveProduct,
  createProduct,
  getProductById,
  listProducts,
  updateProduct,
} from '../services/productService.js';

export async function listProductsController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    search?: string;
    categoryId?: string;
    includeArchived?: boolean;
    lowStockOnly?: boolean;
  };
  const result = await listProducts(shopId, q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function getProductController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const product = await getProductById(shopId, String(req.params.id));
  sendSuccess(res, product, 200);
}

export async function createProductController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const product = await createProduct(
    shopId,
    req.body as {
      id?: string;
      categoryId?: string | null;
      name: string;
      sku?: string | null;
      description?: string | null;
      unit: Unit;
      purchaseCost: string;
      sellingPrice: string;
      initialQuantity?: string;
      minStockLevel?: string;
      imageUri?: string | null;
    },
  );
  sendSuccess(res, product, 201);
}

export async function updateProductController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const product = await updateProduct(
    shopId,
    String(req.params.id),
    req.body as {
      categoryId?: string | null;
      name?: string;
      sku?: string | null;
      description?: string | null;
      unit?: Unit;
      purchaseCost?: string;
      sellingPrice?: string;
      minStockLevel?: string;
      imageUri?: string | null;
    },
  );
  sendSuccess(res, product, 200);
}

export async function archiveProductController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const product = await archiveProduct(shopId, String(req.params.id));
  sendSuccess(res, product, 200);
}

export async function adjustProductStockController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const movement = await adjustProductStock(
    shopId,
    String(req.params.id),
    req.body as {
      id?: string;
      type: 'ADJUSTMENT' | 'DAMAGED' | 'EXPIRED';
      quantityChange: string;
      reason: string;
      occurredAt?: string;
    },
  );
  sendSuccess(res, movement, 201);
}

export async function listProductMovementsController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as { page: number; pageSize: number };
  const result = await listProductMovements(shopId, String(req.params.id), q);
  sendSuccess(res, result.items, 200, result.meta);
}
