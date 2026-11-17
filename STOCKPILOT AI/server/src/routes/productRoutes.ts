import { Router } from 'express';
import { z } from 'zod';
import {
  adjustProductStockController,
  archiveProductController,
  createProductController,
  getProductController,
  listProductMovementsController,
  listProductsController,
  updateProductController,
} from '../controllers/productController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  baseListQuerySchema,
  booleanQueryFlagSchema,
  decimalStringSchema,
  nonNegativeDecimalStringSchema,
} from '../lib/schemas.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  uuidParamSchema,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { UNITS } from '../shared/enums.js';

const listProductsQuerySchema = baseListQuerySchema
  .extend({
    categoryId: z.string().uuid().optional(),
    includeArchived: booleanQueryFlagSchema,
    lowStockOnly: booleanQueryFlagSchema,
  })
  .strict();

const listMovementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const createProductSchema = z
  .object({
    id: z.string().uuid().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1, 'Product name is required').max(150),
    sku: z.string().trim().max(80).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    unit: z.enum(UNITS),
    purchaseCost: nonNegativeDecimalStringSchema,
    sellingPrice: nonNegativeDecimalStringSchema,
    initialQuantity: nonNegativeDecimalStringSchema.optional(),
    minStockLevel: nonNegativeDecimalStringSchema.optional(),
    imageUri: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const updateProductSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(150).optional(),
    sku: z.string().trim().max(80).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    unit: z.enum(UNITS).optional(),
    purchaseCost: nonNegativeDecimalStringSchema.optional(),
    sellingPrice: nonNegativeDecimalStringSchema.optional(),
    minStockLevel: nonNegativeDecimalStringSchema.optional(),
    imageUri: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const adjustStockSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(['ADJUSTMENT', 'DAMAGED', 'EXPIRED']),
    quantityChange: decimalStringSchema,
    reason: z.string().trim().max(300).optional().default(''),
    occurredAt: z.string().datetime().optional(),
  })
  .strict();

export const productRouter = Router();

productRouter.use(authenticate);

productRouter.get(
  '/',
  requirePermission('product:read'),
  validateQuery(listProductsQuerySchema),
  asyncHandler(listProductsController),
);

productRouter.post(
  '/',
  requirePermission('product:write'),
  validateBody(createProductSchema, {
    ignoreFields: ['quantityOnHand', 'averageCost', 'lastPurchaseCost'],
  }),
  asyncHandler(createProductController),
);

productRouter.get(
  '/:id',
  requirePermission('product:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getProductController),
);

productRouter.patch(
  '/:id',
  requirePermission('product:write'),
  validateParams(uuidParamSchema),
  validateBody(updateProductSchema, {
    // BR-P2: Product update ignores quantityOnHand and averageCost
    ignoreFields: ['quantityOnHand', 'averageCost', 'lastPurchaseCost'],
  }),
  asyncHandler(updateProductController),
);

productRouter.post(
  '/:id/archive',
  requirePermission('product:archive'),
  validateParams(uuidParamSchema),
  asyncHandler(archiveProductController),
);

productRouter.post(
  '/:id/adjust-stock',
  requirePermission('stock:adjust'),
  validateParams(uuidParamSchema),
  validateBody(adjustStockSchema),
  asyncHandler(adjustProductStockController),
);

productRouter.get(
  '/:id/movements',
  requirePermission('stock:read'),
  validateParams(uuidParamSchema),
  validateQuery(listMovementsQuerySchema),
  asyncHandler(listProductMovementsController),
);
