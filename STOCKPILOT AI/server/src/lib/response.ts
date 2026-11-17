import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta,
): void {
  if (meta) {
    res.status(statusCode).json({ success: true, data, meta });
    return;
  }
  res.status(statusCode).json({ success: true, data });
}
