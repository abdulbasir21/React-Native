import { Router } from 'express';
import { z } from 'zod';
import {
  listStockMovementsController,
  reconcileStockController,
} from '../controllers/stockMovementController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { STOCK_MOVEMENT_TYPES } from '../shared/enums.js';

const listStockMovementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    productId: z.string().uuid().optional(),
    type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  })
  .strict();

export const stockMovementRouter = Router();

stockMovementRouter.use(authenticate);

stockMovementRouter.get(
  '/',
  requirePermission('stock:read'),
  validateQuery(listStockMovementsQuerySchema),
  asyncHandler(listStockMovementsController),
);

stockMovementRouter.get(
  '/reconcile',
  requirePermission('stock:read'),
  asyncHandler(reconcileStockController),
);
