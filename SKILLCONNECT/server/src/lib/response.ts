import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): void {
  res.status(statusCode).json(
    meta
      ? { success: true, data, meta }
      : { success: true, data }
  );
}
