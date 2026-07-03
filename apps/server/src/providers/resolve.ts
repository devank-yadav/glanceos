import type { BlockSourceT, SourceMapT } from "@glanceos/schema";
import { markConnStatus } from "../connections";
import { AuthError, cached, FAIL, RateLimitError } from "../fetchers/cache";
import { resolvePath } from "../fetchers/jsonfeed";
import { PROVIDERS, providerIdFor } from "./registry";

// Resolve a block's `source` to the data its renderer expects. A connection's
// decrypted secret is supplied lazily by `lookup` (server-internal; never
// reaches a client). Everything flows through cached() so a dead source → null
// → the screen's calm placeholder, and N blocks on one source dedup to ONE fetch
// (cache key = connection + kind + query, NOT block id).

export interface ConnContext {
  secret: string | null;
  config: Record<string, unknown>;
}
// May be async (oauth connections refresh their access token on read).
export type ConnLookup = (connectionId: string) => ConnContext | null | Promise<ConnContext | null>;

const stableHash = (q: Record<string, string>): string =>
  Object.keys(q).sort().map((k) => `${k}=${q[k]}`).join("&");

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  const n = Number.parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const leaf = (el: unknown): unknown => (el && typeof el === "object" ? (el as Record<string, unknown>).value ?? el : el);

function project(el: unknown, fields?: Record<string, string>): unknown {
  if (!fields) return el;
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(fields)) out[k] = resolvePath(el, p);
  return out;
}

// v6.1 "0,33,67:Low,OK,High" → thresholds [0,33,67] + labels; maps a number to a word.
function rangeToWords(n: number, arg?: string): unknown {
  if (!arg) return n;
  const [th = "", lb = ""] = arg.split(":");
  const thresholds = th.split(",").map(Number).filter(Number.isFinite);
  const labels = lb.split(",").map((s) => s.trim()).filter(Boolean);
  if (!labels.length) return n;
  for (let i = 0; i < thresholds.length; i++) if (n < thresholds[i]!) return labels[i] ?? labels[labels.length - 1];
  return labels[labels.length - 1];
}

function reduce(v: unknown, transform: SourceMapT["transform"], arg?: string): unknown {
  const arr = Array.isArray(v) ? v : null;
  const scalar = () => toNum(arr ? arr[0] : v); // v6.1 scalar shapers operate on the value (first element if array)
  switch (transform) {
    case "series": return (arr ?? []).map((el) => toNum(leaf(el)));
    case "count": return arr ? arr.length : v == null ? 0 : 1;
    case "sum": return (arr ?? []).reduce((s, el) => s + toNum(leaf(el)), 0);
    case "first": return arr ? arr[0] : v;
    case "last": return arr ? arr[arr.length - 1] : v;
    case "join":
      return (arr ?? []).map((el) => (el && typeof el === "object"
        ? String((el as Record<string, unknown>).text ?? (el as Record<string, unknown>).value ?? JSON.stringify(el))
        : String(el))).join("\n");
    case "percent": return toNum(arr ? arr[0] : v);
    // v6.1 derived transforms — pure, total scalar shapers (a raw number → a human phrase).
    case "round": { const d = Math.max(0, Math.min(6, Math.trunc(toNum(arg)) || 0)); return Number(scalar().toFixed(d)); }
    case "currency": { const sym = (arg ?? "$").trim() || "$"; return sym + scalar().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    case "duration": { const s = Math.max(0, Math.round(scalar())); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`; }
    case "rangeToWords": return rangeToWords(scalar(), arg);
    default: return v;
  }
}

const NEEDS_ARRAY = new Set(["series", "sum", "count", "join"]);

export function applyMap(raw: unknown, map: SourceMapT): unknown {
  // No shaping requested → pass the provider payload straight to an already-typed live
  // renderer (e.g. {events} for a calendar, the RSS shape). A `fields` map IS shaping
  // (a pair chart projecting a root array → [{label,value}]), so don't short-circuit it.
  if (map.transform === "none" && !map.items && !map.path && !map.fields && !map.chain?.length) return raw;
  // Working set: an explicit array path, else an explicit scalar path, else the
  // root payload itself (so a top-level JSON array works with no path).
  let val: unknown = map.items ? resolvePath(raw, map.items) : map.path ? resolvePath(raw, map.path) : raw;
  if (Array.isArray(val) && map.fields) val = val.map((el) => project(el, map.fields));
  if (NEEDS_ARRAY.has(map.transform) && !Array.isArray(val)) return null; // wrong shape → placeholder/props fallback
  let out = reduce(val, map.transform, map.transformArg);
  // #23 — the chain: each extra step shapes the PREVIOUS step's result, in order
  // ("sum, then round 1, then currency €"). The same wrong-shape rule applies per
  // step, so a mid-chain mismatch degrades to the placeholder exactly like today.
  for (const step of map.chain ?? []) {
    if (NEEDS_ARRAY.has(step.t) && !Array.isArray(out)) return null;
    out = reduce(out, step.t, step.arg);
  }
  return out;
}

export async function resolveSource(src: BlockSourceT, lookup?: ConnLookup): Promise<unknown> {
  const provider = PROVIDERS.get(providerIdFor(src.kind));
  if (!provider) return null;
  let secret: string | null = null;
  let config: Record<string, unknown> = {};
  if (src.connectionId) {
    const c = await lookup?.(src.connectionId);
    if (!c) return null; // connection missing / revoked / not supported here
    secret = c.secret;
    config = c.config;
  }
  const ttl = Math.max(provider.minRefreshMs, (src.refreshSeconds ?? provider.defaultTtlMs / 1000) * 1000);
  const key = `src:${src.connectionId ?? "url"}:${src.kind}:${stableHash(src.query)}`;
  const run = () => provider.resolve({ resource: src.kind, query: src.query, secret, config });
  // For connection-backed sources, reflect the fetch outcome on the connection
  // (ok / needs_auth / rate-limited / error) so the Integrations page can badge
  // it. Re-throw so cached() still sees the type (429 → backoff) and stores null.
  const cid = src.connectionId;
  const fn = cid
    ? async () => {
        try {
          const r = await run();
          if (r != null) markConnStatus(cid, "ok"); // don't clear a needs_auth that produced null
          return r;
        } catch (e) {
          if (e instanceof AuthError) markConnStatus(cid, "needs_auth", "Authorization failed — reconnect this app");
          else if (e instanceof RateLimitError) markConnStatus(cid, "error", `Rate-limited — retrying in ${Math.ceil(e.retryAfterMs / 1000)}s`);
          else markConnStatus(cid, "error", e instanceof Error ? e.message : "fetch failed");
          throw e;
        }
      }
    : run;
  const raw = await cached(key, ttl, FAIL, fn);
  if (raw == null) return null;
  return applyMap(raw, src.map);
}
