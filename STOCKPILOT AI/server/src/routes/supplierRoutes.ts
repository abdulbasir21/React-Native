import { Router } from 'express';
import { z } from 'zod';
import {
  archiveSupplierController,
  createSupplierController,
  getSupplierController,
  listSupplierPaymentsController,
  listSupplierPurchasesController,
  listSuppliersController,
  paySupplierController,
  updateSupplierController,
} from '../controllers/supplierController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  baseListQuerySchema,
  booleanQueryFlagSchema,
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

const listSuppliersQuerySchema = baseListQuerySchema
  .extend({
    includeArchived: booleanQueryFlagSchema,
  })
  .strict();

const createSupplierSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Supplier name is required').max(150),
    phone: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const updateSupplierSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const supplierRouter = Router();

supplierRouter.use(authenticate);

supplierRouter.get(
  '/',
  requirePermission('supplier:read'),
  validateQuery(listSuppliersQuerySchema),
  asyncHandler(listSuppliersController),
);

supplierRouter.post(
  '/',
  requirePermission('supplier:write'),
  validateBody(createSupplierSchema),
  asyncHandler(createSupplierController),
);

supplierRouter.get(
  '/:id',
  requirePermission('supplier:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getSupplierController),
);

supplierRouter.patch(
  '/:id',
  requirePermission('supplier:write'),
  validateParams(uuidParamSchema),
  validateBody(updateSupplierSchema),
  asyncHandler(updateSupplierController),
);

const paySupplierSchema = z
  .object({
    amount: positiveDecimalStringSchema,
    method: z.enum(NON_CREDIT_PAYMENT_METHODS),
    paidAt: z.string().datetime().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    purchaseId: z.string().uuid().optional(),
    paymentIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .strict();

const supplierSubListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

supplierRouter.post(
  '/:id/archive',
  requirePermission('supplier:write'),
  validateParams(uuidParamSchema),
  asyncHandler(archiveSupplierController),
);

supplierRouter.post(
  '/:id/pay',
  requirePermission('payment:create'),
  validateParams(uuidParamSchema),
  validateBody(paySupplierSchema),
  asyncHandler(paySupplierController),
);

supplierRouter.get(
  '/:id/payments',
  requirePermission('supplier:read'),
  validateParams(uuidParamSchema),
  validateQuery(supplierSubListQuerySchema),
  asyncHandler(listSupplierPaymentsController),
);

supplierRouter.get(
  '/:id/purchases',
  requirePermission('purchase:read'),
  validateParams(uuidParamSchema),
  validateQuery(supplierSubListQuerySchema),
  asyncHandler(listSupplierPurchasesController),
);
