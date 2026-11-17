export const AI_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const shopCaches = new Map<string, Map<string, CacheEntry>>();

export function getAiReadCache<T>(
  shopId: string,
  key: string,
  nowMs: number = Date.now(),
): T | undefined {
  const map = shopCaches.get(shopId);
  if (!map) return undefined;
  const entry = map.get(key);
  if (!entry) return undefined;
  if (nowMs >= entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setAiReadCache<T>(
  shopId: string,
  key: string,
  value: T,
  nowMs: number = Date.now(),
): void {
  let map = shopCaches.get(shopId);
  if (!map) {
    map = new Map();
    shopCaches.set(shopId, map);
  }
  map.set(key, {
    value,
    expiresAt: nowMs + AI_CACHE_TTL_MS,
  });
}

export function clearShopAiCache(shopId: string): void {
  shopCaches.delete(shopId);
}
