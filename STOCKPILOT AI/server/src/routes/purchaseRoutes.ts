import { Router } from 'express';
import { z } from 'zod';
import {
  createPurchaseController,
  getPurchaseController,
  listPurchasesController,
  paySinglePurchaseController,
} from '../controllers/purchaseController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  baseListQuerySchema,
  nonNegativeDecimalStringSchema,
  positiveDecimalStringSchema,
} from '../lib/schemas.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  uuidParamSchema,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { NON_CREDIT_PAYMENT_METHODS } from '../shared/enums.js';

const listPurchasesQuerySchema = baseListQuerySchema
  .extend({
    supplierId: z.string().uuid().optional(),
    period: z.enum(['today', 'week', 'month']).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict();

const purchaseLineSchema = z
  .object({
    id: z.string().uuid().optional(),
    movementId: z.string().uuid().optional(),
    productId: z.string().uuid(),
    quantity: positiveDecimalStringSchema,
    unitCost: nonNegativeDecimalStringSchema,
  })
  .strict();

const createPurchaseSchema = z
  .object({
    id: z.string().uuid().optional(),
    supplierId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
    occurredAt: z.string().datetime().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    amountPaid: nonNegativeDecimalStringSchema.optional(),
    paymentMethod: z.enum(NON_CREDIT_PAYMENT_METHODS).optional(),
    paymentId: z.string().uuid().optional(),
    items: z.array(purchaseLineSchema).min(1).max(200),
  })
  .strict();

const paySinglePurchaseSchema = z
  .object({
    amount: positiveDecimalStringSchema,
    method: z.enum(NON_CREDIT_PAYMENT_METHODS),
    paidAt: z.string().datetime().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    paymentId: z.string().uuid().optional(),
  })
  .strict();

export const purchaseRouter = Router();

purchaseRouter.use(authenticate);

purchaseRouter.get(
  '/',
  requirePermission('purchase:read'),
  validateQuery(listPurchasesQuerySchema),
  asyncHandler(listPurchasesController),
);

purchaseRouter.post(
  '/',
  requirePermission('purchase:create'),
  validateBody(createPurchaseSchema),
  asyncHandler(createPurchaseController),
);

purchaseRouter.get(
  '/:id',
  requirePermission('purchase:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getPurchaseController),
);

purchaseRouter.post(
  '/:id/payments',
  requirePermission('payment:create'),
  validateParams(uuidParamSchema),
  validateBody(paySinglePurchaseSchema),
  asyncHandler(paySinglePurchaseController),
);
