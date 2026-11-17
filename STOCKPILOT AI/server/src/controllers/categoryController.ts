import type { Request, Response } from 'express';
import { sendSuccess } from '../lib/response.js';
import { getShopId } from '../lib/shopScope.js';
import {
  createCategory,
  listCategories,
  updateCategory,
} from '../services/categoryService.js';

export async function listCategoriesController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const categories = await listCategories(shopId);
  sendSuccess(res, categories, 200);
}

export async function createCategoryController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const category = await createCategory(shopId, req.body as { id?: string; name: string });
  sendSuccess(res, category, 201);
}

export async function updateCategoryController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const category = await updateCategory(shopId, String(req.params.id), req.body as { name: string });
  sendSuccess(res, category, 200);
}
