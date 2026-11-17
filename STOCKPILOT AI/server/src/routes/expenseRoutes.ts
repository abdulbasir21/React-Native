import { Router } from 'express';
import { z } from 'zod';
import {
  createExpenseController,
  getExpenseController,
  listExpensesController,
  updateExpenseController,
} from '../controllers/expenseController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { baseListQuerySchema, positiveDecimalStringSchema } from '../lib/schemas.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  uuidParamSchema,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import { EXPENSE_CATEGORIES, NON_CREDIT_PAYMENT_METHODS } from '../shared/enums.js';

const listExpensesQuerySchema = baseListQuerySchema
  .extend({
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    period: z.enum(['today', 'week', 'month']).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict();

const createExpenseSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1, 'Expense title is required').max(150),
    category: z.enum(EXPENSE_CATEGORIES),
    amount: positiveDecimalStringSchema,
    expenseDate: z.string().datetime(),
    paymentMethod: z.enum(NON_CREDIT_PAYMENT_METHODS),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const updateExpenseSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    amount: positiveDecimalStringSchema.optional(),
    expenseDate: z.string().datetime().optional(),
    paymentMethod: z.enum(NON_CREDIT_PAYMENT_METHODS).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    reason: z.string().trim().max(300).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const expenseRouter = Router();

expenseRouter.use(authenticate);

expenseRouter.get(
  '/',
  requirePermission('expense:read'),
  validateQuery(listExpensesQuerySchema),
  asyncHandler(listExpensesController),
);

expenseRouter.post(
  '/',
  requirePermission('expense:write'),
  validateBody(createExpenseSchema),
  asyncHandler(createExpenseController),
);

expenseRouter.get(
  '/:id',
  requirePermission('expense:read'),
  validateParams(uuidParamSchema),
  asyncHandler(getExpenseController),
);

expenseRouter.patch(
  '/:id',
  requirePermission('expense:write'),
  validateParams(uuidParamSchema),
  validateBody(updateExpenseSchema),
  asyncHandler(updateExpenseController),
);
