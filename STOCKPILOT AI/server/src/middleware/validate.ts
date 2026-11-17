import type { NextFunction, Request, Response } from 'express';
import { type ZodTypeAny, z } from 'zod';
import { badRequest } from '../lib/errors.js';

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}

/**
 * Strips any client-supplied shopId field (BR-A4: body shopId is ignored)
 * and optional caller-specified ignored fields (e.g. BR-P2 quantity fields on product update),
 * while preserving strict rejection of all other unknown fields.
 */
export function stripIgnoredFields(body: unknown, extraIgnore: string[] = []): unknown {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const rest = { ...(body as Record<string, unknown>) };
    delete rest.shopId;
    for (const key of extraIgnore) {
      delete rest[key];
    }
    return rest;
  }
  return body;
}

export function validateBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
  options?: { ignoreFields?: string[] },
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const cleaned = stripIgnoredFields(req.body, options?.ignoreFields);
    const parsed = schema.safeParse(cleaned);
    if (!parsed.success) {
      next(badRequest('Invalid request body', formatZodIssues(parsed.error)));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(badRequest('Invalid query parameters', formatZodIssues(parsed.error)));
      return;
    }
    req.query = parsed.data as Request['query'];
    next();
  };
}

export function validateParams<TSchema extends ZodTypeAny>(schema: TSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      next(badRequest('Invalid route parameters', formatZodIssues(parsed.error)));
      return;
    }
    req.params = parsed.data as Request['params'];
    next();
  };
}

export const uuidParamSchema = z
  .object({
    id: z.string().uuid('Invalid UUID'),
  })
  .strict();
