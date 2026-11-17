import type { Request, Response } from 'express';
import { getShopId } from '../lib/shopScope.js';
import { sendSuccess } from '../lib/response.js';
import {
  getAuthenticatedOwner,
  loginOwner,
  registerOwnerAndShop,
  type LoginInput,
  type RegisterInput,
} from '../services/authService.js';

export async function registerController(req: Request, res: Response): Promise<void> {
  const result = await registerOwnerAndShop(req.body as RegisterInput);
  sendSuccess(res, result, 201);
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const result = await loginOwner(req.body as LoginInput);
  sendSuccess(res, result, 200);
}

export async function meController(req: Request, res: Response): Promise<void> {
  const shopId = getShopId(req);
  const userId = req.auth!.userId;
  const result = await getAuthenticatedOwner(userId, shopId);
  sendSuccess(res, result, 200);
}
