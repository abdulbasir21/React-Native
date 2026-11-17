import { Router } from 'express';
import { z } from 'zod';
import {
  archiveCustomerController,
  createCustomerController,
  getCustomerController,
  listCustomerPaymentsController,
  listCustomersController,
  listCustomerSalesController,
  receiveCustomerPaymentController,
  updateCustomerController,
} from '../controllers/customerController.js';
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

const listCustomersQuerySchema = baseListQuerySchema
  .extend({
    includeArchived: booleanQueryFlagSchema,
  })
  .strict();

const createCustomerSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Customer name is required').max(150),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const customerRouter = Router();

customerRouter.use(authenticate);

customerRouter.get(
  '/',
  requirePermission('customer:read'),
  validateQuery(listCustomersQuerySchema),
  asyncHandler(listCustomersController),
);

customerRouter.post(
  '/',
  requirePermission('customer:write'),
  validateBody(createCustomerSchema),
  asyncHandler(createCustomerController),
);

customerRouter.get(
  '/:id',
  requirePermission('customer:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getCustomerController),
);

customerRouter.patch(
  '/:id',
  requirePermission('customer:write'),
  validateParams(uuidParamSchema),
  validateBody(updateCustomerSchema),
  asyncHandler(updateCustomerController),
);

const receiveCustomerPaymentSchema = z
  .object({
    amount: positiveDecimalStringSchema,
    method: z.enum(NON_CREDIT_PAYMENT_METHODS),
    paidAt: z.string().datetime().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    paymentIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict();

customerRouter.post(
  '/:id/archive',
  requirePermission('customer:write'),
  validateParams(uuidParamSchema),
  asyncHandler(archiveCustomerController),
);

customerRouter.post(
  '/:id/receive-payment',
  requirePermission('payment:create'),
  validateParams(uuidParamSchema),
  validateBody(receiveCustomerPaymentSchema),
  asyncHandler(receiveCustomerPaymentController),
);

customerRouter.get(
  '/:id/sales',
  requirePermission('customer:read'),
  validateParams(uuidParamSchema),
  asyncHandler(listCustomerSalesController),
);

customerRouter.get(
  '/:id/payments',
  requirePermission('customer:read'),
  validateParams(uuidParamSchema),
  asyncHandler(listCustomerPaymentsController),
);
