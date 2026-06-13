// Shared cache + fetch helpers for the live-data blocks. Same shape as
// weather.ts: cache by input key, short TTL on failure, hard timeout, and on
// any error return null so the screen shows a calm placeholder (never crashes).
// Per-input caching keeps every keyless source far under its rate limits.

interface Entry {
  at: number;
  data: unknown;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

const UA = "GlanceOS/0.6 (self-hosted calm dashboard)";

export async function getJSON<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": UA, accept: "application/json", ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": UA, ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/**
 * Cached fetch: returns cached data within `ttlMs` (or `failTtlMs` after a
 * failure), de-duplicates concurrent calls for the same key, and never throws.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  failTtlMs: number,
  fn: () => Promise<T | null>,
): Promise<T | null> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < (hit.data === null ? failTtlMs : ttlMs)) return hit.data as T | null;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T | null>;

  const p = (async () => {
    let data: T | null = null;
    try {
      data = await fn();
    } catch {
      data = null;
    }
    store.set(key, { at: Date.now(), data });
    inflight.delete(key);
    return data;
  })();
  inflight.set(key, p);
  return p;
}

const MIN = 60_000;
const HOUR = 3_600_000;
export const TTL = { min: MIN, m5: 5 * MIN, m10: 10 * MIN, m15: 15 * MIN, m30: 30 * MIN, h1: HOUR, h6: 6 * HOUR, h12: 12 * HOUR };
export const FAIL = 60_000;
