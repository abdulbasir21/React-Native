import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodIssue } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

function isZodError(err: unknown): err is ZodError {
  return (
    err instanceof ZodError ||
    (err instanceof Error &&
      err.name === "ZodError" &&
      Array.isArray((err as { issues?: unknown }).issues))
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (isZodError(err)) {
    res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.issues.map((issue: ZodIssue) => ({
          field: issue.path.join(".") || undefined,
          message: issue.message,
        })),
      },
    });
    return;
  }

  logger.error(
    { err: err instanceof Error ? err.message : "Unknown error" },
    "Unhandled server error"
  );

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
