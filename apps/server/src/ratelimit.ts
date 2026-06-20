import type { Context, Next } from "hono";

// In-memory fixed-window rate limiter. Single-container only (resets on restart,
// not shared across replicas) — enough to blunt brute-force / floods on a
// self-hosted box. Set GLANCEOS_RATE_LIMIT=off to disable (tests, trusted LANs).

const OFF = process.env.GLANCEOS_RATE_LIMIT === "off";
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateCheck(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  if (OFF) return { ok: true, retryAfter: 0 };
  let w = windows.get(key);
  if (!w || now >= w.resetAt) { w = { count: 0, resetAt: now + windowMs }; windows.set(key, w); }
  w.count++;
  if (w.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

const clientIp = (c: Context): string =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";

/** Hono middleware: cap requests per window, keyed by IP (default) or a custom key. */
export function limiter(bucket: string, max: number, windowMs: number, keyFn?: (c: Context) => string) {
  return async (c: Context, next: Next) => {
    const r = rateCheck(`${bucket}:${keyFn ? keyFn(c) : clientIp(c)}`, max, windowMs);
    if (!r.ok) return c.json({ error: "rate limited — slow down" }, 429, { "retry-after": String(r.retryAfter) });
    return next();
  };
}

/** Drop expired windows (call occasionally to bound memory). */
export function gcRateLimits(now = Date.now()): void {
  for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
}
