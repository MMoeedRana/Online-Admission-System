/**
 * PERF-9: a small in-process cache for read-heavy figures. Entries live for at most 30 seconds,
 * so dashboards and reports are never more than half a minute behind the database.
 */
export const MAX_CACHE_SECONDS = 30;

const store = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  ttlSeconds = MAX_CACHE_SECONDS,
): Promise<T> {
  const ttl = Math.min(ttlSeconds, MAX_CACHE_SECONDS) * 1000;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), ttl, value });
  value.catch(() => store.delete(key));
  if (store.size > 500) {
    for (const [k, v] of store) if (Date.now() - v.at >= v.ttl) store.delete(k);
  }
  return value;
}

/** Drops cached entries whose key starts with the prefix (for example after a change). */
export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
