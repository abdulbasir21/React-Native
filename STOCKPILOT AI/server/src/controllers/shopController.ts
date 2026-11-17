import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import { getShopById, updateShopById, type UpdateShopInput } from '../services/shopService.js';

export async function getShopController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const shop = await getShopById(shopId);
  sendSuccess(res, shop, 200);
}

export async function updateShopController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const shop = await updateShopById(shopId, req.body as UpdateShopInput);
  sendSuccess(res, shop, 200);
}
