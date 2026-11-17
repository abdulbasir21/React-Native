import type { Request } from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { tooManyRequests } from '../lib/errors.js';

const loginStore = new MemoryStore();

function loginRateLimitKey(req: Request): string {
  const ip = req.ip ?? 'unknown';
  const rawBody = req.body as { email?: unknown } | undefined;
  const email = typeof rawBody?.email === 'string' ? rawBody.email.trim().toLowerCase() : '';
  return `${ip}:${email}`;
}

/**
 * BR-A3: 5 failed login attempts per email + IP per 15 minutes, then HTTP 429.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: loginStore,
  keyGenerator: loginRateLimitKey,
  handler: (_req, _res, next) => {
    next(
      tooManyRequests(
        'RATE_LIMITED',
        'Too many failed login attempts. Please wait 15 minutes and try again.',
      ),
    );
  },
});

/**
 * Test helper to clear in-memory login attempts between integration tests.
 */
export function resetLoginRateLimiter(): void {
  loginStore.resetAll();
}
