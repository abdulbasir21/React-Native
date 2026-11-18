import type { ProviderSearchQuery } from "@skillconnect/shared";
import type { createDiscoveryRepository } from "./discovery.repository.js";

export function createDiscoveryService(
  repo: ReturnType<typeof createDiscoveryRepository>
) {
  const searchProviders = (query: ProviderSearchQuery, nowUtc = new Date()) =>
    repo.searchProviders(query, nowUtc);

  return { searchProviders };
}
