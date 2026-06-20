// The provider registry: each provider knows how to fetch a "resource" and
// return a raw payload. resolve.ts then shapes that payload to a block's needs
// via the block's SourceMap. Pure data + functions, no network at import →
// offline-safe; every fetch goes through the SSRF-guarded cache.ts egress.

import { assertSafeUrl, AuthError, getJSON, getText, httpError, postJSON, TTL } from "../fetchers/cache";
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

// Authorization-code + refresh spec for an oauth2 provider. The self-hoster
// supplies the client id/secret (oauth_apps); this is the public endpoint shape.
export interface OAuthSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  authParams?: Record<string, string>; // extra authorize params (e.g. access_type=offline)
  tokenAuth?: "basic"; // send client creds as HTTP Basic at the token endpoint (Spotify/Notion)
  nonExpiring?: boolean; // token has no expires_in / refresh (e.g. GitHub OAuth) → never refresh
}

export interface Provider {
  id: string;
  label: string;
  category: string;
  authKind: AuthKind;
  defaultTtlMs: number;
  minRefreshMs: number;
  resources: ProviderResource[];
  oauth?: OAuthSpec; // present only for authKind "oauth2"
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

// ---- productivity providers (paste a personal token — no OAuth app needed) ----

reg({
  id: "todoist", label: "Todoist", category: "tasks", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [
    { id: "todoist.tasks", label: "Tasks", shape: "list" },
    { id: "todoist.projects", label: "Projects", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "todoist.projects") return getJSON("https://api.todoist.com/rest/v2/projects", h);
    const params = new URLSearchParams();
    if (ctx.query.project_id) params.set("project_id", ctx.query.project_id);
    else if (ctx.query.filter) params.set("filter", ctx.query.filter);
    const qs = params.toString();
    return getJSON(`https://api.todoist.com/rest/v2/tasks${qs ? `?${qs}` : ""}`, h);
  },
});

reg({
  // OAuth now (self-registered GitHub OAuth app); tokens don't expire / have no
  // refresh → nonExpiring. Existing personal-token connections still resolve
  // (their connection row stays auth_kind=token; resolve() only reads ctx.secret).
  id: "github", label: "GitHub", category: "dev", authKind: "oauth2",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user"],
    nonExpiring: true,
  },
  resources: [
    { id: "github.search", label: "Issue / PR search", shape: "list" },
    { id: "github.issues", label: "Repo issues", shape: "list" },
    { id: "github.repo", label: "Repo stats", shape: "scalar" },
    { id: "github.commits", label: "Commit activity", shape: "series" },
  ],
  async resolve(ctx) {
    const h: Record<string, string> = { accept: "application/vnd.github+json" };
    if (ctx.secret) h.authorization = `Bearer ${ctx.secret}`;
    const repo = ctx.query.repo; // "owner/name"
    // Issue/PR search across all repos — q like "is:open assignee:@me label:urgent"
    if (ctx.resource === "github.search") {
      const q = ctx.query.q || "is:open assignee:@me";
      return getJSON(`https://api.github.com/search/issues?per_page=20&q=${encodeURIComponent(q)}`, h);
    }
    if (ctx.resource === "github.issues") {
      if (ctx.query.q) return getJSON(`https://api.github.com/search/issues?q=${encodeURIComponent(ctx.query.q)}`, h);
      if (repo) return getJSON(`https://api.github.com/repos/${repo}/issues?per_page=20`, h);
      return null;
    }
    if (ctx.resource === "github.repo") return repo ? getJSON(`https://api.github.com/repos/${repo}`, h) : null;
    if (ctx.resource === "github.commits") return repo ? getJSON(`https://api.github.com/repos/${repo}/stats/commit_activity`, h) : null;
    return null;
  },
});

reg({
  // OAuth (self-registered Notion integration); Basic-auth token endpoint, no
  // expiry/refresh. owner=user is required on the authorize request.
  id: "notion", label: "Notion", category: "docs", authKind: "oauth2",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    authParams: { owner: "user" },
    tokenAuth: "basic",
    nonExpiring: true,
  },
  resources: [{ id: "notion.database", label: "Database rows", shape: "table" }],
  async resolve(ctx) {
    if (!ctx.secret || !ctx.query.database_id) return null;
    return postJSON(
      `https://api.notion.com/v1/databases/${ctx.query.database_id}/query`,
      ctx.query.body ? JSON.parse(ctx.query.body) : {},
      { authorization: `Bearer ${ctx.secret}`, "notion-version": "2022-06-28" },
    );
  },
});

reg({
  id: "linear", label: "Linear", category: "issues", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "linear.issues", label: "Issues", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const query = ctx.query.gqlQuery || "{ issues(first: 20) { nodes { title state { name } } } }";
    return postJSON("https://api.linear.app/graphql", { query }, { authorization: ctx.secret });
  },
});

// ---- OAuth provider: Google Calendar (read-only). Needs a Google Cloud OAuth
// app (the self-hoster's client id/secret in oauth_apps); ctx.secret is the
// access token the resolver gets after connLookupFor refreshes it if expired.
export interface GEvent { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }
/** Shape Google Calendar API items into the {title,start,end} events the calendar renderer reads. */
export function mapGoogleEvents(items: GEvent[]): { events: { title: string; start: string; end?: string }[] } {
  const events = items
    .map((e) => ({ title: e.summary || "(busy)", start: e.start?.dateTime || e.start?.date || "", end: e.end?.dateTime || e.end?.date }))
    .filter((e) => e.start);
  return { events };
}
reg({
  id: "google", label: "Google Calendar", category: "calendar", authKind: "oauth2",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    authParams: { access_type: "offline", prompt: "consent" }, // ensures a refresh_token
  },
  resources: [{ id: "google.calendar", label: "Calendar events", shape: "events" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const cal = encodeURIComponent(ctx.query.calendarId || "primary");
    const max = Number(ctx.query.max) || 8;
    const timeMin = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`
      + `?singleEvents=true&orderBy=startTime&maxResults=${max}&timeMin=${encodeURIComponent(timeMin)}`;
    const raw = (await getJSON(url, { authorization: `Bearer ${ctx.secret}` })) as { items?: GEvent[] } | null;
    if (!raw?.items) return null;
    return mapGoogleEvents(raw.items);
  },
});

// ---- Token provider: Home Assistant (long-lived access token). Self-hosted →
// usually a private IP, so it needs GLANCEOS_ALLOW_PRIVATE_EGRESS=1 (SSRF opt-out).
reg({
  id: "homeassistant", label: "Home Assistant", category: "smart-home", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 30_000,
  resources: [
    { id: "homeassistant.entity", label: "Entity state", shape: "scalar" },
    { id: "homeassistant.history", label: "Entity history", shape: "series" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = String(ctx.config.baseUrl || "").replace(/\/+$/, "");
    const entity = ctx.query.entity;
    if (!base || !entity) return null;
    const h = { authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "homeassistant.history") {
      const hist = (await getJSON(`${base}/api/history/period?filter_entity_id=${encodeURIComponent(entity)}&minimal_response`, h)) as unknown[][] | null;
      return hist?.[0] ?? null; // [{ state, last_changed }, …]
    }
    return getJSON(`${base}/api/states/${encodeURIComponent(entity)}`, h); // { state, attributes, … }
  },
});

// ---- OAuth provider: Microsoft 365 / Outlook Calendar (read-only). Multi-tenant
// 'common' endpoints; the self-hoster registers an Azure app. ctx.secret is the
// access token (refreshed via offline_access).
export interface GraphEvent { subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }
/** Shape Microsoft Graph calendar items into the {title,start,end} events the calendar renderer reads. */
export function mapGraphEvents(items: GraphEvent[]): { events: { title: string; start: string; end?: string }[] } {
  const events = items
    .map((e) => ({ title: e.subject || "(busy)", start: e.start?.dateTime || "", end: e.end?.dateTime }))
    .filter((e) => e.start);
  return { events };
}
reg({
  id: "microsoft", label: "Microsoft 365 / Outlook", category: "calendar", authKind: "oauth2",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Calendars.Read", "offline_access", "openid", "profile"],
  },
  resources: [{ id: "microsoft.calendar", label: "Calendar events", shape: "events" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const max = Number(ctx.query.max) || 8;
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86_400_000);
    const url = "https://graph.microsoft.com/v1.0/me/calendarView"
      + `?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}`
      + `&$orderby=${encodeURIComponent("start/dateTime")}&$top=${max}&$select=subject,start,end`;
    const raw = (await getJSON(url, { authorization: `Bearer ${ctx.secret}`, prefer: 'outlook.timezone="UTC"' })) as { value?: GraphEvent[] } | null;
    if (!raw?.value) return null;
    return mapGraphEvents(raw.value);
  },
});

// ---- OAuth provider: Spotify now-playing. Basic-auth token endpoint; the
// currently-playing endpoint returns 204 (empty) when nothing is playing.
export interface SpotifyTrack { item?: { name?: string; artists?: { name?: string }[] } }
export function formatNowPlaying(status: number, data: SpotifyTrack | null): { value: string } {
  if (status === 204 || !data?.item) return { value: "Nothing playing" };
  const artists = (data.item.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
  return { value: `${data.item.name ?? "Unknown"}${artists ? ` — ${artists}` : ""}` };
}
// ---- Token provider: Asana (personal access token, Bearer). ----
reg({
  id: "asana", label: "Asana", category: "tasks", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [
    { id: "asana.tasks", label: "My tasks", shape: "list" },
    { id: "asana.projects", label: "Projects", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { authorization: `Bearer ${ctx.secret}` };
    const pick = (r: unknown): unknown => (r && typeof r === "object" ? (r as { data?: unknown }).data ?? r : r);
    if (ctx.resource === "asana.projects") {
      const ws = ctx.query.workspace;
      return pick(await getJSON(`https://app.asana.com/api/1.0/projects?limit=50${ws ? `&workspace=${encodeURIComponent(ws)}` : ""}`, h));
    }
    const params = new URLSearchParams({ limit: "50", completed_since: "now", opt_fields: "name,completed,due_on" });
    if (ctx.query.project) params.set("project", ctx.query.project);
    else { params.set("assignee", ctx.query.assignee || "me"); if (ctx.query.workspace) params.set("workspace", ctx.query.workspace); }
    return pick(await getJSON(`https://app.asana.com/api/1.0/tasks?${params.toString()}`, h));
  },
});

// ---- Token provider: Jira (email + API token → HTTP Basic; JQL search). The
// site base URL + email are non-secret connection config; the token is sealed.
// Cloud 3LO / cloudId is deferred — this is the token-only path.
reg({
  id: "jira", label: "Jira", category: "issues", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "jira.search", label: "Issue search (JQL)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = String(ctx.config.baseUrl || "").replace(/\/+$/, "");
    const email = String(ctx.config.email || "");
    if (!base || !email) return null;
    const basic = Buffer.from(`${email}:${ctx.secret}`).toString("base64");
    const jql = ctx.query.jql || "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
    const url = `${base}/rest/api/3/search?maxResults=20&fields=${encodeURIComponent("summary,status,priority")}&jql=${encodeURIComponent(jql)}`;
    const r = (await getJSON(url, { authorization: `Basic ${basic}`, accept: "application/json" })) as { issues?: unknown[] } | null;
    return r?.issues ?? r;
  },
});

// ---- Token provider: Trello (API key is non-secret config, token is sealed;
// both ride as query params). Exercises the EXTRA_CONFIG declarative field. ----
reg({
  id: "trello", label: "Trello", category: "tasks", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 30_000,
  resources: [
    { id: "trello.cards", label: "Cards (list or board)", shape: "list" },
    { id: "trello.boards", label: "My boards", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const key = String(ctx.config.key || "");
    if (!key) return null;
    const auth = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(ctx.secret)}`;
    if (ctx.resource === "trello.boards") return getJSON(`https://api.trello.com/1/members/me/boards?fields=${encodeURIComponent("name,url")}&${auth}`);
    const list = ctx.query.list, board = ctx.query.board;
    if (list) return getJSON(`https://api.trello.com/1/lists/${encodeURIComponent(list)}/cards?fields=${encodeURIComponent("name,due,url")}&${auth}`);
    if (board) return getJSON(`https://api.trello.com/1/boards/${encodeURIComponent(board)}/cards?fields=${encodeURIComponent("name,due,url")}&${auth}`);
    return null;
  },
});

// ---- OAuth provider: Slack. v2 OAuth; the token endpoint posts client creds in
// the body (not Basic) and bot tokens don't expire → nonExpiring. Slack signals
// failure with HTTP 200 + {ok:false,error}, so we inspect the body, not the status.
const SLACK_AUTH_ERRORS = new Set(["invalid_auth", "not_authed", "token_revoked", "account_inactive", "token_expired"]);
export function slackError(error: string | undefined): Error {
  const msg = `slack: ${error || "request failed"}`;
  return error && SLACK_AUTH_ERRORS.has(error) ? new AuthError(msg) : new Error(msg);
}
reg({
  id: "slack", label: "Slack", category: "chat", authKind: "oauth2",
  defaultTtlMs: TTL.m5, minRefreshMs: 30_000,
  oauth: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "channels:history", "groups:read", "groups:history"],
    nonExpiring: true,
  },
  resources: [
    { id: "slack.messages", label: "Channel messages", shape: "list" },
    { id: "slack.channels", label: "Channels", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "slack.channels") {
      const data = (await getJSON("https://slack.com/api/conversations.list?limit=100&types=public_channel,private_channel", h)) as { ok: boolean; error?: string; channels?: unknown[] };
      if (!data.ok) throw slackError(data.error);
      return data.channels ?? [];
    }
    const channel = ctx.query.channel;
    if (!channel) return null;
    const max = Number(ctx.query.max) || 10;
    const data = (await getJSON(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=${max}`, h)) as { ok: boolean; error?: string; messages?: { text?: string; ts?: string }[] };
    if (!data.ok) throw slackError(data.error);
    return { items: (data.messages ?? []).map((m) => ({ text: m.text ?? "", ts: m.ts ?? "" })) };
  },
});

reg({
  id: "spotify", label: "Spotify", category: "media", authKind: "oauth2",
  defaultTtlMs: TTL.min, minRefreshMs: 20_000,
  oauth: {
    authorizeUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scopes: ["user-read-currently-playing"],
    tokenAuth: "basic",
  },
  resources: [{ id: "spotify.nowplaying", label: "Now playing", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const url = "https://api.spotify.com/v1/me/player/currently-playing";
    await assertSafeUrl(url); // 204-aware: can't use getJSON (it chokes on an empty body)
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { authorization: `Bearer ${ctx.secret}`, accept: "application/json" } });
    if (res.status !== 204 && !res.ok) throw httpError(res); // 401 → needs_auth via the resolver
    const data = res.status === 204 ? null : ((await res.json()) as SpotifyTrack);
    return formatNowPlaying(res.status, data);
  },
});
