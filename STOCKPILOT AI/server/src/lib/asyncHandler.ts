import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps async Express 4 route handlers so rejected promises reach errorHandler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
