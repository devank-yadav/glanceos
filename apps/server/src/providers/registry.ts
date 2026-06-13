// The provider registry: each provider knows how to fetch a "resource" and
// return a raw payload. resolve.ts then shapes that payload to a block's needs
// via the block's SourceMap. Pure data + functions, no network at import →
// offline-safe; every fetch goes through the SSRF-guarded cache.ts egress.

import { getJSON, getText, postJSON, TTL } from "../fetchers/cache";
import { parseIcs } from "../fetchers/ics";
import { headlinesData } from "../fetchers/live";

export type AuthKind = "none" | "url" | "token" | "apiKey" | "oauth2";

export interface ResolveCtx {
  resource: string; // the BlockSource.kind, e.g. "ical.events"
  query: Record<string, string>; // BlockSource.query
  secret: string | null; // decrypted token / apiKey / secret-URL from a connection, or null
  config: Record<string, unknown>; // non-secret connection config (headerName, baseUrl, …)
}

export interface ProviderResource {
  id: string; // becomes BlockSource.kind
  label: string;
  shape: "series" | "scalar" | "list" | "events" | "table";
}

export interface Provider {
  id: string;
  label: string;
  category: string;
  authKind: AuthKind;
  defaultTtlMs: number;
  minRefreshMs: number;
  resources: ProviderResource[];
  resolve(ctx: ResolveCtx): Promise<unknown>;
}

export const PROVIDERS = new Map<string, Provider>();
const reg = (p: Provider) => PROVIDERS.set(p.id, p);

/** "ical.events" → "ical"; "rest" → "rest". */
export const providerIdFor = (kind: string): string => kind.split(".")[0]!;

function bearer(ctx: ResolveCtx): Record<string, string> {
  if (!ctx.secret) return {};
  const name = (ctx.config.headerName as string) || "Authorization";
  const value = name.toLowerCase() === "authorization" ? `Bearer ${ctx.secret}` : ctx.secret;
  return { [name]: value };
}

// Minimal CSV → array-of-row-objects (handles quoted fields with commas).
function parseCsv(text: string): { rows: Record<string, string>[]; columns: string[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  const cells = lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  });
  const columns = cells[0] ?? [];
  const rows = cells.slice(1).map((r) => Object.fromEntries(columns.map((h, i) => [h, r[i] ?? ""])));
  return { rows, columns };
}

// ---- works-today providers (no OAuth app registration needed) ----

reg({
  id: "rest", label: "REST / JSON", category: "generic", authKind: "apiKey",
  defaultTtlMs: TTL.m10, minRefreshMs: 30_000,
  resources: [{ id: "rest", label: "JSON endpoint", shape: "series" }],
  async resolve(ctx) {
    const url = ctx.query.url;
    if (!url) return null;
    return getJSON(url, bearer(ctx));
  },
});

reg({
  id: "graphql", label: "GraphQL", category: "generic", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 30_000,
  resources: [{ id: "graphql", label: "GraphQL query", shape: "table" }],
  async resolve(ctx) {
    const url = ctx.query.url;
    if (!url) return null;
    let variables: unknown;
    try { variables = ctx.query.variables ? JSON.parse(ctx.query.variables) : undefined; } catch { variables = undefined; }
    return postJSON(url, { query: ctx.query.gqlQuery ?? ctx.query.query ?? "", variables }, bearer(ctx));
  },
});

reg({
  id: "ical", label: "Calendar (iCal URL)", category: "calendar", authKind: "url",
  defaultTtlMs: TTL.m30, minRefreshMs: 60_000,
  resources: [{ id: "ical.events", label: "Events", shape: "events" }],
  async resolve(ctx) {
    const url = ctx.secret || ctx.query.url; // a connection's secret .ics URL, or a public one
    if (!url) return null;
    const max = Number(ctx.query.max) || 8;
    return { events: parseIcs(await getText(url)).slice(0, max) };
  },
});

reg({
  id: "sheets", label: "Google Sheet (published CSV)", category: "docs", authKind: "url",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "sheets.csv", label: "Published CSV", shape: "table" }],
  async resolve(ctx) {
    const url = ctx.secret || ctx.query.url;
    if (!url) return null;
    return parseCsv(await getText(url));
  },
});

reg({
  id: "rss", label: "RSS / Atom", category: "generic", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "rss.feed", label: "Feed", shape: "list" }],
  async resolve(ctx) {
    const url = ctx.query.url;
    if (!url) return null;
    return headlinesData({ url, max: Number(ctx.query.max) || 10 });
  },
});
