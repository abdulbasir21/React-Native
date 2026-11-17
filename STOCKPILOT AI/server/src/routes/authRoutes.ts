import { Router } from 'express';
import { z } from 'zod';
import {
  loginController,
  meController,
  registerController,
} from '../controllers/authController.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { loginRateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { SHOP_TYPES } from '../shared/enums.js';

export const registerSchema = z
  .object({
    ownerName: z.string().trim().min(1, 'Owner name is required').max(120),
    shopName: z.string().trim().min(1, 'Shop name is required').max(150),
    email: z.string().trim().email('Valid email is required').max(255),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password is too long'),
    shopType: z.enum(SHOP_TYPES),
    currency: z.string().trim().min(3).max(10).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    address: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email('Valid email is required').max(255),
    password: z.string().min(1, 'Password is required').max(128),
  })
  .strict();

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), asyncHandler(registerController));
authRouter.post(
  '/login',
  validateBody(loginSchema),
  loginRateLimiter,
  asyncHandler(loginController),
);
authRouter.get('/me', authenticate, asyncHandler(meController));
