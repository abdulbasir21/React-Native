import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { hasPermission, type Permission } from '../lib/permissions.js';
import type { AuthContext } from '../types/express.js';

const tokenPayloadSchema = z.object({
  userId: z.string().uuid(),
  shopId: z.string().uuid(),
  role: z.literal('OWNER'),
});

/**
 * Signs a long-lived JWT containing userId, shopId, and role (no refresh tokens in MVP).
 */
export function signAuthToken(payload: AuthContext, expiresInOverride?: SignOptions['expiresIn']): string {
  const env = getEnv();
  const expiresIn = (expiresInOverride ?? env.JWT_EXPIRES_IN) as SignOptions['expiresIn'];
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

/**
 * Verifies the Bearer JWT from the Authorization header and attaches req.auth (BR-A4).
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header) {
    next(unauthorized('Authentication required'));
    return;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    next(unauthorized('Authentication required'));
    return;
  }

  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET);
    const parsed = tokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      next(unauthorized('Invalid authentication token'));
      return;
    }

    req.auth = {
      userId: parsed.data.userId,
      shopId: parsed.data.shopId,
      role: parsed.data.role,
    };
    next();
  } catch {
    next(unauthorized('Authentication token invalid or expired'));
  }
}

/**
 * Enforces permission on every protected route (AGENTS.md Section 3).
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized('Authentication required'));
      return;
    }
    if (!hasPermission(req.auth.role, permission)) {
      next(forbidden('Insufficient permissions'));
      return;
    }
    req.requiredPermission = permission;
    next();
  };
}
