import type { NextFunction, Request, Response } from "express";
import type { ProviderSearchQuery } from "@skillconnect/shared";
import { sendSuccess } from "../../lib/response.js";
import type { createDiscoveryService } from "./discovery.service.js";

export function createDiscoveryController(
  service: ReturnType<typeof createDiscoveryService>
) {
  const search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as ProviderSearchQuery;
      const result = await service.searchProviders(query);
      sendSuccess(
        res,
        { providers: result.items },
        200,
        { total: result.total, limit: query.limit, offset: query.offset }
      );
    } catch (err) {
      next(err);
    }
  };

  return { search };
}
