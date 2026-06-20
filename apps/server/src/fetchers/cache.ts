// Shared cache + fetch helpers for the live-data blocks. Same shape as
// weather.ts: cache by input key, short TTL on failure, hard timeout, and on
// any error return null so the screen shows a calm placeholder (never crashes).
// Per-input caching keeps every keyless source far under its rate limits.

import { lookup as lookupCb, type LookupAddress, type LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent, fetch } from "undici";

interface Entry {
  at: number;
  data: unknown;
  retryUntil?: number; // for 429s: don't refetch before this (rate-limit backoff)
}

// Typed fetch failures so the resolver can badge a connection (needs_auth vs
// rate-limited vs generic error) and so cached() can back off on 429s.
export class AuthError extends Error {}
export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) { super("HTTP 429"); this.retryAfterMs = retryAfterMs; }
}

function retryAfterMs(res: Response): number {
  const ra = res.headers.get("retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000); // delta-seconds
    const when = Date.parse(ra);
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now()); // HTTP-date
  }
  const reset = Number(res.headers.get("x-ratelimit-reset")); // GitHub: epoch seconds
  if (Number.isFinite(reset) && reset > 0) return Math.max(0, reset * 1000 - Date.now());
  return 60_000; // sensible default backoff
}

export function httpError(res: Response): Error {
  if (res.status === 401 || res.status === 403) return new AuthError(`HTTP ${res.status}`);
  if (res.status === 429) return new RateLimitError(retryAfterMs(res));
  return new Error(`HTTP ${res.status}`);
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

const UA = "GlanceOS/0.6 (self-hosted calm dashboard)";

// SSRF guard: every outbound fetch (including user-supplied jsonFeed/ics/REST
// URLs) passes through here. We resolve DNS first and refuse private/loopback/
// link-local targets so a board can't be used to probe the host's internal
// network or a cloud metadata endpoint. Trusted-LAN installs can opt out.
const ALLOW_PRIVATE = process.env.GLANCEOS_ALLOW_PRIVATE_EGRESS === "1";

/** True for loopback/private/link-local/CGNAT/metadata addresses, in IPv4,
 *  IPv6, AND IPv4-mapped-IPv6 form (dotted `::ffff:a.b.c.d` or hex
 *  `::ffff:hhhh:hhhh`) — the latter were the SSRF bypass. Exported for tests. */
export function isPrivate(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, ""); // strip [] and zone id
  // IPv4-mapped IPv6, dotted tail: judge the embedded v4.
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v);
  if (dotted) return isPrivate(dotted[1]!);
  // IPv4-mapped IPv6, hex tail (::ffff:a9fe:a9fe == 169.254.169.254): reconstruct.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (hex) {
    const hi = parseInt(hex[1]!, 16), lo = parseInt(hex[2]!, 16);
    return isPrivate(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  if (net.isIPv4(v)) {
    const [a, b] = v.split(".").map(Number);
    return (
      a === 0 || a === 127 || a === 10 ||
      (a === 169 && b === 254) || // link-local + cloud metadata 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) // CGNAT
    );
  }
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

// A custom DNS lookup that REFUSES private addresses at connect time. The
// validating dispatcher below routes every undici connection — including each
// redirect hop — through this, so the resolved IP we connect to is the one we
// checked (closing the DNS-rebind TOCTOU) and a public URL that 302s to a
// private IP is also blocked. SNI/Host stay the original hostname.
type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family: number) => void;
function safeLookup(hostname: string, options: LookupOptions, cb: LookupCb): void {
  lookupCb(hostname, options, (err, address, family) => {
    if (err) return cb(err, "", 0);
    const list: LookupAddress[] = Array.isArray(address) ? address : [{ address: address as string, family: family as number }];
    if (list.some((a) => isPrivate(a.address))) return cb(Object.assign(new Error("blocked private address"), { code: "EBLOCKED" }), "", 0);
    cb(null, address as string | LookupAddress[], family as number);
  });
}
// One shared dispatcher; null when egress to private hosts is explicitly allowed.
const safeDispatcher = ALLOW_PRIVATE ? undefined : new Agent({ connect: { lookup: safeLookup as never } });

export async function assertSafeUrl(raw: string): Promise<void> {
  if (ALLOW_PRIVATE) return;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("blocked scheme");
  // Fast pre-check for a clear error before opening a socket; the validating
  // dispatcher is the real enforcement (it also covers rebind + redirect hops).
  const results = await lookup(u.hostname, { all: true });
  if (results.length === 0 || results.some((r) => isPrivate(r.address))) throw new Error("blocked address");
}

export async function getJSON<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  await assertSafeUrl(url);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    dispatcher: safeDispatcher,
    headers: { "user-agent": UA, accept: "application/json", ...headers },
  });
  if (!res.ok) throw httpError(res as unknown as Response);
  return (await res.json()) as T;
}

export async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  await assertSafeUrl(url);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    dispatcher: safeDispatcher,
    headers: { "user-agent": UA, ...headers },
  });
  if (!res.ok) throw httpError(res as unknown as Response);
  return await res.text();
}

export async function postJSON<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  await assertSafeUrl(url);
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(8000),
    dispatcher: safeDispatcher,
    headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw httpError(res as unknown as Response);
  return (await res.json()) as T;
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
  if (hit) {
    // success → ttlMs; failure → failTtlMs, but a 429 extends that to its retry-after
    const window = hit.data === null ? Math.max(failTtlMs, (hit.retryUntil ?? 0) - hit.at) : ttlMs;
    if (Date.now() - hit.at < window) return hit.data as T | null;
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T | null>;

  const p = (async () => {
    let data: T | null = null;
    let retryUntil: number | undefined;
    try {
      data = await fn();
    } catch (e) {
      data = null;
      if (e instanceof RateLimitError) retryUntil = Date.now() + e.retryAfterMs;
    }
    store.set(key, { at: Date.now(), data, retryUntil });
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
