import { Router } from 'express';
import { z } from 'zod';
import { getShopController, updateShopController } from '../controllers/shopController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { SHOP_TYPES } from '../shared/enums.js';

export const updateShopSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    type: z.enum(SHOP_TYPES).optional(),
    currency: z.string().trim().min(3).max(10).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const shopRouter = Router();

shopRouter.get(
  '/',
  authenticate,
  requirePermission('shop:read'),
  asyncHandler(getShopController),
);

shopRouter.patch(
  '/',
  authenticate,
  requirePermission('shop:write'),
  validateBody(updateShopSchema),
  asyncHandler(updateShopController),
);
