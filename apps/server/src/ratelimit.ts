import type { Context, Next } from "hono";

// In-memory fixed-window rate limiter. Single-container only (resets on restart,
// not shared across replicas) — enough to blunt brute-force / floods on a
// self-hosted box. Set GLANCEOS_RATE_LIMIT=off to disable (tests, trusted LANs).

const OFF = process.env.GLANCEOS_RATE_LIMIT === "off";
const windows = new Map<string, { count: number; resetAt: number }>();

// A shared-window backend (e.g. Redis) so replicas count against the same window.
// Default null = the in-memory windows above (single process). Set by initRedis.
export interface RateBackend {
  check(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfter: number }>;
}
let rateBackend: RateBackend | null = null;
export function setRateBackend(b: RateBackend | null): void {
  rateBackend = b;
}

export function rateCheck(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  if (OFF) return { ok: true, retryAfter: 0 };
  let w = windows.get(key);
  if (!w || now >= w.resetAt) { w = { count: 0, resetAt: now + windowMs }; windows.set(key, w); }
  w.count++;
  if (w.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

// x-forwarded-for is attacker-controllable unless the request actually came
// through a proxy we trust. By default we IGNORE it and key on the real socket
// peer (fail-closed, no spoofing). Set GLANCEOS_TRUSTED_PROXIES to the proxy
// peer IP(s) — or "*" to trust any peer — to honor XFF behind a reverse proxy.
const TRUSTED_PROXIES = new Set((process.env.GLANCEOS_TRUSTED_PROXIES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const TRUST_ANY_PROXY = TRUSTED_PROXIES.has("*");

function peerIp(c: Context): string {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "local";
}

const clientIp = (c: Context): string => {
  const peer = peerIp(c);
  if (TRUST_ANY_PROXY || TRUSTED_PROXIES.has(peer)) {
    const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip");
    if (xff) return xff;
  }
  return peer;
};

/** Hono middleware: cap requests per window, keyed by IP (default) or a custom key.
 *  Uses the shared backend when one is configured, else the in-memory windows. */
export function limiter(bucket: string, max: number, windowMs: number, keyFn?: (c: Context) => string) {
  return async (c: Context, next: Next) => {
    if (OFF) return next();
    const key = `${bucket}:${keyFn ? keyFn(c) : clientIp(c)}`;
    const r = rateBackend ? await rateBackend.check(key, max, windowMs) : rateCheck(key, max, windowMs);
    if (!r.ok) return c.json({ error: "rate limited — slow down" }, 429, { "retry-after": String(r.retryAfter) });
    return next();
  };
}

/** Drop expired windows (call occasionally to bound memory). */
export function gcRateLimits(now = Date.now()): void {
  for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
}
