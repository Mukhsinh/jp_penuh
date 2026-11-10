/**
 * High-performance, lightweight in-memory cache for server-side Next.js operations.
 * Significantly reduces database roundtrips and connection pool exhaustion
 * during concurrent multi-user access.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const memoryCache = new Map<string, CacheEntry<any>>()

/**
 * Retrieves a value from the in-memory cache or fetches and stores it if missing or expired.
 * @param key Unique cache key
 * @param ttlMs Time-to-live in milliseconds (e.g. 60000 = 1 minute)
 * @param fetcher Async function to fetch fresh data on cache miss
 */
export async function getOrSetCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const existing = memoryCache.get(key)
  const now = Date.now()
  if (existing && existing.expiresAt > now) {
    return existing.value
  }

  const value = await fetcher()
  memoryCache.set(key, {
    value,
    expiresAt: now + ttlMs
  })
  return value
}

/**
 * Invalidates cache entries by key or prefix.
 */
export function invalidateCache(keyPrefix?: string) {
  if (!keyPrefix) {
    memoryCache.clear()
    return
  }
  memoryCache.forEach((_, key) => {
    if (key.startsWith(keyPrefix)) {
      memoryCache.delete(key)
    }
  })
}
