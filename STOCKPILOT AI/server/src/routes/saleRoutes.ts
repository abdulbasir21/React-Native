import { Router } from 'express';
import { z } from 'zod';
import {
  addSalePaymentController,
  cancelSaleController,
  createSaleController,
  createSaleReturnController,
  getSaleController,
  getSaleReceiptController,
  listSalesController,
} from '../controllers/saleController.js';
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
import {
  NON_CREDIT_PAYMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SALE_STATUSES,
} from '../shared/enums.js';

const listSalesQuerySchema = baseListQuerySchema
  .extend({
    status: z.enum(SALE_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    customerId: z.string().uuid().optional(),
    period: z.enum(['today', 'week', 'month']).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict();

const saleLineSchema = z
  .object({
    id: z.string().uuid().optional(),
    movementId: z.string().uuid().optional(),
    productId: z.string().uuid(),
    quantity: positiveDecimalStringSchema,
    unitPrice: nonNegativeDecimalStringSchema.nullable().optional(),
  })
  .strict();

const discountSchema = z
  .object({
    type: z.enum(['AMOUNT', 'PERCENT']),
    value: nonNegativeDecimalStringSchema,
  })
  .strict();

const createSaleSchema = z
  .object({
    id: z.string().uuid().optional(),
    paymentId: z.string().uuid().optional(),
    customerId: z.string().uuid().nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
    occurredAt: z.string().datetime().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    discount: discountSchema.nullable().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    amountReceived: nonNegativeDecimalStringSchema.nullable().optional(),
    items: z.array(saleLineSchema).min(1).max(200),
  })
  .strict();

const addSalePaymentSchema = z
  .object({
    id: z.string().uuid().optional(),
    amount: positiveDecimalStringSchema,
    method: z.enum(NON_CREDIT_PAYMENT_METHODS),
    paidAt: z.string().datetime().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

const createSaleReturnItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    movementId: z.string().uuid().optional(),
    saleItemId: z.string().uuid(),
    quantity: positiveDecimalStringSchema,
  })
  .strict();

const createSaleReturnSchema = z
  .object({
    id: z.string().uuid().optional(),
    paymentId: z.string().uuid().optional(),
    reason: z.string().trim().min(1, 'Return reason is required').max(300),
    refundMethod: z.enum(NON_CREDIT_PAYMENT_METHODS).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    items: z.array(createSaleReturnItemSchema).min(1).max(200),
  })
  .strict();

const cancelSaleSchema = z
  .object({
    reason: z.string().trim().min(1, 'Cancellation reason is required').max(300),
    refundMethod: z.enum(NON_CREDIT_PAYMENT_METHODS).nullable().optional(),
    occurredAt: z.string().datetime().optional(),
    paymentId: z.string().uuid().optional(),
  })
  .strict();

export const saleRouter = Router();

saleRouter.use(authenticate);

saleRouter.get(
  '/',
  requirePermission('sale:read'),
  validateQuery(listSalesQuerySchema),
  asyncHandler(listSalesController),
);

saleRouter.post(
  '/',
  requirePermission('sale:create'),
  // BR-SA6: ignore any client-supplied total/subtotal/discountAmount fields, compute on server
  validateBody(createSaleSchema, { ignoreFields: ['subtotal', 'discountAmount', 'total'] }),
  asyncHandler(createSaleController),
);

saleRouter.get(
  '/:id',
  requirePermission('sale:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getSaleController),
);

saleRouter.get(
  '/:id/receipt',
  requirePermission('sale:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getSaleReceiptController),
);

saleRouter.post(
  '/:id/payments',
  requirePermission('payment:create'),
  validateParams(uuidParamSchema),
  validateBody(addSalePaymentSchema),
  asyncHandler(addSalePaymentController),
);

saleRouter.post(
  '/:id/returns',
  requirePermission('sale:return'),
  validateParams(uuidParamSchema),
  validateBody(createSaleReturnSchema),
  asyncHandler(createSaleReturnController),
);

saleRouter.post(
  '/:id/cancel',
  requirePermission('sale:cancel'),
  validateParams(uuidParamSchema),
  validateBody(cancelSaleSchema),
  asyncHandler(cancelSaleController),
);
