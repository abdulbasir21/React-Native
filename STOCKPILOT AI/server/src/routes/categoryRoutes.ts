import { Router } from 'express';
import { z } from 'zod';
import {
  createCategoryController,
  listCategoriesController,
  updateCategoryController,
} from '../controllers/categoryController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { uuidParamSchema, validateBody, validateParams } from '../middleware/validate.js';

const createCategorySchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Category name is required').max(100),
  })
  .strict();

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Category name is required').max(100),
  })
  .strict();

export const categoryRouter = Router();

categoryRouter.use(authenticate);

categoryRouter.get('/', requirePermission('product:read'), asyncHandler(listCategoriesController));
categoryRouter.post(
  '/',
  requirePermission('product:write'),
  validateBody(createCategorySchema),
  asyncHandler(createCategoryController),
);
categoryRouter.patch(
  '/:id',
  requirePermission('product:write'),
  validateParams(uuidParamSchema),
  validateBody(updateCategorySchema),
  asyncHandler(updateCategoryController),
);
