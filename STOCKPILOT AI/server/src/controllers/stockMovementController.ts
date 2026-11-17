import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import type { StockMovementType } from '../shared/enums.js';
import { listStockMovements, reconcileShopStock } from '../services/inventoryService.js';

export async function listStockMovementsController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const q = req.query as unknown as {
    page: number;
    pageSize: number;
    productId?: string;
    type?: StockMovementType;
  };
  const result = await listStockMovements(shopId, q);
  sendSuccess(res, result.items, 200, result.meta);
}

export async function reconcileStockController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const result = await reconcileShopStock(shopId);
  sendSuccess(res, result, 200);
}
