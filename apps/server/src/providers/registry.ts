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

// ===================== v5.0 smart-life providers =====================

// ---- Travel time / commute (keyless OSRM public router). origin+dest → ETA. ----
export function formatTravelTime(raw: { routes?: { duration: number; distance: number }[] } | null): { durationMin: number; distanceKm: number; value: string } | null {
  const r = raw?.routes?.[0];
  if (!r) return null;
  const durationMin = Math.round(r.duration / 60);
  const distanceKm = Math.round(r.distance / 100) / 10;
  return { durationMin, distanceKm, value: `${durationMin} min` };
}
reg({
  id: "osrm", label: "Travel time (OSRM)", category: "place", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "osrm.route", label: "Driving / cycling / walking ETA", shape: "scalar" }],
  async resolve(ctx) {
    const fLat = Number(ctx.query.fromLat), fLon = Number(ctx.query.fromLon), tLat = Number(ctx.query.toLat), tLon = Number(ctx.query.toLon);
    if (![fLat, fLon, tLat, tLon].every(Number.isFinite)) return null;
    const profile = ["driving", "cycling", "walking"].includes(ctx.query.profile || "") ? ctx.query.profile : "driving";
    const base = String(ctx.config.baseUrl || "").replace(/\/+$/, "") || "https://router.project-osrm.org";
    // Coordinates are sanitized to numbers above, so they can't inject into the path.
    const url = `${base}/route/v1/${profile}/${fLon},${fLat};${tLon},${tLat}?overview=false`;
    return formatTravelTime((await getJSON(url)) as Parameters<typeof formatTravelTime>[0]);
  },
});

// ---- Mail: Gmail + Outlook unread counts (read-only OAuth). ----
export function gmailUnread(raw: { messagesUnread?: number } | null): { value: number } { return { value: Number(raw?.messagesUnread ?? 0) }; }
reg({
  id: "gmail", label: "Gmail (unread)", category: "mail", authKind: "oauth2",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    authParams: { access_type: "offline", prompt: "consent" },
  },
  resources: [{ id: "gmail.unread", label: "Unread count", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const label = encodeURIComponent(ctx.query.label || "INBOX");
    const raw = (await getJSON(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${label}`, { authorization: `Bearer ${ctx.secret}` })) as { messagesUnread?: number } | null;
    return gmailUnread(raw);
  },
});

export function outlookUnread(raw: { unreadItemCount?: number } | null): { value: number } { return { value: Number(raw?.unreadItemCount ?? 0) }; }
reg({
  id: "outlookmail", label: "Outlook mail (unread)", category: "mail", authKind: "oauth2",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Mail.Read", "offline_access", "openid", "profile"],
  },
  resources: [{ id: "outlookmail.unread", label: "Unread count", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const folder = encodeURIComponent(ctx.query.folder || "inbox");
    const raw = (await getJSON(`https://graph.microsoft.com/v1.0/me/mailFolders/${folder}`, { authorization: `Bearer ${ctx.secret}` })) as { unreadItemCount?: number } | null;
    return outlookUnread(raw);
  },
});

// ---- Health: Fitbit (OAuth) + Oura (personal token). steps / sleep. ----
export function fitbitSteps(raw: { summary?: { steps?: number } } | null): { value: number } { return { value: Number(raw?.summary?.steps ?? 0) }; }
reg({
  id: "fitbit", label: "Fitbit", category: "health", authKind: "oauth2",
  defaultTtlMs: TTL.m15, minRefreshMs: 5 * 60_000,
  oauth: {
    authorizeUrl: "https://www.fitbit.com/oauth2/authorize",
    tokenUrl: "https://api.fitbit.com/oauth2/token",
    scopes: ["activity", "sleep"],
    tokenAuth: "basic",
  },
  resources: [{ id: "fitbit.steps", label: "Steps today", shape: "scalar" }, { id: "fitbit.sleep", label: "Sleep (last night)", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "fitbit.sleep") {
      const raw = (await getJSON("https://api.fitbit.com/1.2/user/-/sleep/date/today.json", h)) as { summary?: { totalMinutesAsleep?: number } } | null;
      const mins = Number(raw?.summary?.totalMinutesAsleep ?? 0);
      return { value: mins ? `${Math.floor(mins / 60)}h ${mins % 60}m` : "—" };
    }
    return fitbitSteps((await getJSON("https://api.fitbit.com/1/user/-/activities/date/today.json", h)) as Parameters<typeof fitbitSteps>[0]);
  },
});

reg({
  id: "oura", label: "Oura Ring", category: "health", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 5 * 60_000,
  resources: [{ id: "oura.activity", label: "Steps today", shape: "scalar" }, { id: "oura.sleep", label: "Sleep score", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { authorization: `Bearer ${ctx.secret}` };
    const day = new Date().toISOString().slice(0, 10);
    if (ctx.resource === "oura.sleep") {
      const raw = (await getJSON(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${day}&end_date=${day}`, h)) as { data?: { score?: number }[] } | null;
      return { value: Number(raw?.data?.[0]?.score ?? 0) };
    }
    const raw = (await getJSON(`https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${day}&end_date=${day}`, h)) as { data?: { steps?: number }[] } | null;
    return { value: Number(raw?.data?.[0]?.steps ?? 0) };
  },
});

// ============================================================================
// Integrations B1 — keyless social / dev / books / gaming / sports providers.
// No login required: a friendly resource picker + a query param (subreddit,
// package, handle…) is all the user needs. Each returns a normalized payload
// ({items:[…]} or {value}) so existing list/stat blocks bind with little mapping.
// ============================================================================

const UA = { "User-Agent": "glanceos/1.0 (+https://github.com/devank-yadav/glanceos)" };

reg({
  id: "reddit", label: "Reddit", category: "social", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "reddit.posts", label: "Subreddit posts", shape: "list" }],
  async resolve(ctx) {
    const sub = (ctx.query.subreddit || "popular").replace(/[^\w+]/g, "");
    const sort = ["hot", "new", "top", "rising"].includes(ctx.query.sort || "") ? ctx.query.sort : "hot";
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const t = ctx.query.t || "day";
    const raw = (await getJSON(`https://www.reddit.com/r/${sub}/${sort}.json?limit=${max}&t=${t}`, UA)) as
      { data?: { children?: { data?: { title?: string; score?: number; num_comments?: number; permalink?: string; subreddit?: string } }[] } } | null;
    const items = (raw?.data?.children ?? []).map((c) => ({
      title: c.data?.title ?? "",
      score: Number(c.data?.score ?? 0),
      comments: Number(c.data?.num_comments ?? 0),
      url: c.data?.permalink ? `https://reddit.com${c.data.permalink}` : "",
      label: c.data?.subreddit ? `r/${c.data.subreddit}` : "",
    }));
    return { items };
  },
});

reg({
  id: "devto", label: "DEV.to", category: "dev", authKind: "none",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "devto.articles", label: "Articles", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const params = new URLSearchParams({ per_page: String(max) });
    if (ctx.query.tag) params.set("tag", ctx.query.tag);
    if (ctx.query.username) params.set("username", ctx.query.username);
    if (ctx.query.top) params.set("top", ctx.query.top);
    const raw = (await getJSON(`https://dev.to/api/articles?${params}`, UA)) as
      { title?: string; url?: string; positive_reactions_count?: number; comments_count?: number; user?: { name?: string } }[] | null;
    const items = (raw ?? []).map((a) => ({
      title: a.title ?? "", url: a.url ?? "",
      score: Number(a.positive_reactions_count ?? 0), comments: Number(a.comments_count ?? 0),
      label: a.user?.name ?? "",
    }));
    return { items };
  },
});

reg({
  id: "lobsters", label: "Lobsters", category: "dev", authKind: "none",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "lobsters.hottest", label: "Hottest stories", shape: "list" }],
  async resolve(ctx) {
    const tag = (ctx.query.tag || "").replace(/[^\w-]/g, "");
    const url = tag ? `https://lobste.rs/t/${tag}.json` : "https://lobste.rs/hottest.json";
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(url, UA)) as { title?: string; url?: string; score?: number; comment_count?: number; submitter_user?: string }[] | null;
    const items = (raw ?? []).slice(0, max).map((s) => ({
      title: s.title ?? "", url: s.url ?? "", score: Number(s.score ?? 0), comments: Number(s.comment_count ?? 0),
      label: typeof s.submitter_user === "string" ? s.submitter_user : "",
    }));
    return { items };
  },
});

reg({
  id: "npm", label: "npm", category: "dev", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60 * 60_000,
  resources: [{ id: "npm.downloads", label: "Package downloads", shape: "scalar" }],
  async resolve(ctx) {
    const pkg = (ctx.query.package || "").trim();
    if (!pkg) return null;
    const period = ["last-day", "last-week", "last-month"].includes(ctx.query.period || "") ? ctx.query.period : "last-week";
    const raw = (await getJSON(`https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(pkg)}`, UA)) as
      { downloads?: number } | null;
    return { value: Number(raw?.downloads ?? 0), label: `${pkg} · ${period?.replace("last-", "/")}` };
  },
});

reg({
  id: "bluesky", label: "Bluesky", category: "social", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [
    { id: "bluesky.feed", label: "Account posts", shape: "list" },
    { id: "bluesky.profile", label: "Profile stats", shape: "scalar" },
  ],
  async resolve(ctx) {
    const actor = (ctx.query.handle || ctx.query.actor || "").trim().replace(/^@/, "");
    if (!actor) return null;
    if (ctx.resource === "bluesky.profile") {
      const raw = (await getJSON(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`, UA)) as
        { followersCount?: number; followsCount?: number; postsCount?: number; displayName?: string } | null;
      return { value: Number(raw?.followersCount ?? 0), label: `${raw?.displayName ?? actor} · followers` };
    }
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const raw = (await getJSON(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=${max}`, UA)) as
      { feed?: { post?: { record?: { text?: string }; likeCount?: number; replyCount?: number } }[] } | null;
    const items = (raw?.feed ?? []).map((f) => ({
      title: f.post?.record?.text ?? "", score: Number(f.post?.likeCount ?? 0), comments: Number(f.post?.replyCount ?? 0), label: `@${actor}`,
    }));
    return { items };
  },
});

reg({
  id: "mastodon", label: "Mastodon", category: "social", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "mastodon.timeline", label: "Public timeline", shape: "list" }],
  async resolve(ctx) {
    const instance = (ctx.query.instance || "mastodon.social").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const tag = (ctx.query.hashtag || "").replace(/[^\w]/g, "");
    const path = tag ? `/api/v1/timelines/tag/${tag}` : "/api/v1/timelines/public";
    const raw = (await getJSON(`https://${instance}${path}?limit=${max}`, UA)) as
      { content?: string; favourites_count?: number; replies_count?: number; account?: { acct?: string } }[] | null;
    const strip = (html: string) => html.replace(/<[^>]+>/g, "").trim();
    const items = (raw ?? []).map((s) => ({
      title: strip(s.content ?? ""), score: Number(s.favourites_count ?? 0), comments: Number(s.replies_count ?? 0),
      label: s.account?.acct ? `@${s.account.acct}` : "",
    }));
    return { items };
  },
});

reg({
  id: "openlibrary", label: "Open Library", category: "books", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 5 * 60_000,
  resources: [{ id: "openlibrary.search", label: "Book search", shape: "list" }],
  async resolve(ctx) {
    const q = (ctx.query.q || ctx.query.query || "").trim();
    if (!q) return null;
    const max = Math.min(Number(ctx.query.max) || 8, 20);
    const raw = (await getJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${max}&fields=title,author_name,first_publish_year`, UA)) as
      { docs?: { title?: string; author_name?: string[]; first_publish_year?: number }[] } | null;
    const items = (raw?.docs ?? []).map((d) => ({
      title: d.title ?? "", label: (d.author_name ?? [])[0] ?? "", value: d.first_publish_year ?? "",
    }));
    return { items };
  },
});

reg({
  id: "steam", label: "Steam", category: "gaming", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "steam.players", label: "Players online (by app id)", shape: "scalar" }],
  async resolve(ctx) {
    const appid = (ctx.query.appid || "").replace(/\D/g, "");
    if (!appid) return null;
    const raw = (await getJSON(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`, UA)) as
      { response?: { player_count?: number } } | null;
    return { value: Number(raw?.response?.player_count ?? 0), label: "players online" };
  },
});

reg({
  id: "thesportsdb", label: "TheSportsDB", category: "sports", authKind: "none",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  resources: [
    { id: "thesportsdb.next", label: "Team's next events", shape: "list" },
    { id: "thesportsdb.last", label: "Team's last results", shape: "list" },
  ],
  async resolve(ctx) {
    const teamId = (ctx.query.teamId || "").replace(/\D/g, "");
    if (!teamId) return null;
    const ep = ctx.resource === "thesportsdb.last" ? "eventslast.php?id=" : "eventsnext.php?id=";
    type Ev = { strEvent?: string; dateEvent?: string; strTime?: string; intHomeScore?: string; intAwayScore?: string };
    const raw = (await getJSON(`https://www.thesportsdb.com/api/v1/json/3/${ep}${teamId}`, UA)) as
      { events?: Ev[]; results?: Ev[] } | null;
    const list: Ev[] = raw?.events ?? raw?.results ?? [];
    const items = list.map((e) => ({
      title: e.strEvent ?? "",
      label: [e.dateEvent, e.strTime?.slice(0, 5)].filter(Boolean).join(" "),
      value: e.intHomeScore != null && e.intAwayScore != null ? `${e.intHomeScore}–${e.intAwayScore}` : "",
    }));
    return { items };
  },
});

// ============================================================================
// Integrations B2 — keyless civic / finance / media providers (no login).
// ============================================================================

reg({
  id: "usgs", label: "USGS Earthquakes", category: "civic", authKind: "none",
  defaultTtlMs: TTL.m15, minRefreshMs: 5 * 60_000,
  resources: [{ id: "usgs.quakes", label: "Recent earthquakes", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    const minmag = Number(ctx.query.minMagnitude) || 2.5;
    type F = { properties?: { place?: string; mag?: number; time?: number; url?: string } };
    const raw = (await getJSON(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=${max}&orderby=time&minmagnitude=${minmag}`,
      UA,
    )) as { features?: F[] } | null;
    const items = (raw?.features ?? []).map((f) => ({
      title: f.properties?.place ?? "Earthquake",
      value: typeof f.properties?.mag === "number" ? `M${f.properties.mag.toFixed(1)}` : "",
      label: f.properties?.time ? new Date(f.properties.time).toISOString().slice(0, 16).replace("T", " ") : "",
      url: f.properties?.url ?? "",
    }));
    return { items };
  },
});

reg({
  id: "diseasesh", label: "Health stats (disease.sh)", category: "civic", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 10 * 60_000,
  resources: [{ id: "diseasesh.country", label: "Country stats", shape: "scalar" }],
  async resolve(ctx) {
    const country = (ctx.query.country || "World").trim();
    const url = country.toLowerCase() === "world"
      ? "https://disease.sh/v3/covid-19/all"
      : `https://disease.sh/v3/covid-19/countries/${encodeURIComponent(country)}`;
    const raw = (await getJSON(url, UA)) as
      { cases?: number; todayCases?: number; deaths?: number; active?: number; recovered?: number; tests?: number } | null;
    if (!raw) return null;
    return {
      value: Number(raw.active ?? raw.cases ?? 0),
      label: `${country} · active`,
      cases: Number(raw.cases ?? 0), todayCases: Number(raw.todayCases ?? 0),
      deaths: Number(raw.deaths ?? 0), recovered: Number(raw.recovered ?? 0),
    };
  },
});

reg({
  id: "coingecko", label: "CoinGecko", category: "finance", authKind: "none",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [
    { id: "coingecko.markets", label: "Coin prices", shape: "list" },
    { id: "coingecko.trending", label: "Trending coins", shape: "list" },
  ],
  async resolve(ctx) {
    if (ctx.resource === "coingecko.trending") {
      type T = { item?: { name?: string; symbol?: string; market_cap_rank?: number } };
      const raw = (await getJSON("https://api.coingecko.com/api/v3/search/trending", UA)) as { coins?: T[] } | null;
      const items = (raw?.coins ?? []).map((c) => ({
        title: c.item?.name ?? "", label: (c.item?.symbol ?? "").toUpperCase(), value: c.item?.market_cap_rank ?? "",
      }));
      return { items };
    }
    const vs = (ctx.query.vs || "usd").toLowerCase().replace(/[^a-z]/g, "");
    const ids = (ctx.query.ids || "bitcoin,ethereum,solana").replace(/[^\w,-]/g, "");
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    type M = { name?: string; symbol?: string; current_price?: number; price_change_percentage_24h?: number };
    const raw = (await getJSON(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&ids=${ids}&per_page=${max}&page=1`,
      UA,
    )) as M[] | null;
    const items = (raw ?? []).map((c) => ({
      title: c.name ?? "", label: (c.symbol ?? "").toUpperCase(),
      value: c.current_price ?? 0, change: Number(c.price_change_percentage_24h ?? 0),
    }));
    return { items };
  },
});

reg({
  id: "tvmaze", label: "TVmaze", category: "media", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 5 * 60_000,
  resources: [
    { id: "tvmaze.search", label: "Show search", shape: "list" },
    { id: "tvmaze.schedule", label: "Today's episodes (by country)", shape: "list" },
  ],
  async resolve(ctx) {
    if (ctx.resource === "tvmaze.schedule") {
      const country = (ctx.query.country || "US").replace(/[^A-Za-z]/g, "").slice(0, 2) || "US";
      const max = Math.min(Number(ctx.query.max) || 12, 40);
      type E = { name?: string; airtime?: string; show?: { name?: string } };
      const raw = (await getJSON(`https://api.tvmaze.com/schedule?country=${country}`, UA)) as E[] | null;
      const items = (raw ?? []).slice(0, max).map((e) => ({
        title: e.show?.name ?? "", label: e.name ?? "", value: e.airtime ?? "",
      }));
      return { items };
    }
    const q = (ctx.query.q || ctx.query.query || "").trim();
    if (!q) return null;
    const max = Math.min(Number(ctx.query.max) || 8, 20);
    type S = { show?: { name?: string; premiered?: string; rating?: { average?: number } } };
    const raw = (await getJSON(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`, UA)) as S[] | null;
    const items = (raw ?? []).slice(0, max).map((s) => ({
      title: s.show?.name ?? "", label: (s.show?.premiered ?? "").slice(0, 4), value: s.show?.rating?.average ?? "",
    }));
    return { items };
  },
});

reg({
  id: "jikan", label: "Anime (Jikan / MyAnimeList)", category: "media", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 5 * 60_000,
  resources: [
    { id: "jikan.top", label: "Top anime", shape: "list" },
    { id: "jikan.search", label: "Anime search", shape: "list" },
  ],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    type A = { title?: string; title_english?: string; score?: number; year?: number };
    let url: string;
    if (ctx.resource === "jikan.search") {
      const q = (ctx.query.q || ctx.query.query || "").trim();
      if (!q) return null;
      url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=${max}&order_by=score&sort=desc`;
    } else {
      url = `https://api.jikan.moe/v4/top/anime?limit=${max}`;
    }
    const raw = (await getJSON(url, UA)) as { data?: A[] } | null;
    const items = (raw?.data ?? []).map((a) => ({
      title: a.title_english || a.title || "", label: a.year ? String(a.year) : "", value: a.score ?? "",
    }));
    return { items };
  },
});

// ============================================================================
// Integrations B3 — developer / observability providers (paste a personal token
// or API key; no OAuth app needed). Documented REST endpoints; returns the raw
// payload (the resource label notes the array path) which the block's SourceMap
// shapes — same pattern as jira/asana. Can't be live-tested without creds.
// ============================================================================

reg({
  id: "gitlab", label: "GitLab", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [
    { id: "gitlab.issues", label: "Issues assigned to me", shape: "list" },
    { id: "gitlab.mrs", label: "Open merge requests", shape: "list" },
    { id: "gitlab.pipelines", label: "Project pipelines (project_id)", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = ((ctx.config.baseUrl as string) || "https://gitlab.com").replace(/\/+$/, "");
    const h = { "PRIVATE-TOKEN": ctx.secret };
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    if (ctx.resource === "gitlab.mrs") return getJSON(`${base}/api/v4/merge_requests?scope=all&state=opened&per_page=${max}`, h);
    if (ctx.resource === "gitlab.pipelines") {
      const pid = encodeURIComponent(ctx.query.project_id || "");
      if (!pid) return null;
      return getJSON(`${base}/api/v4/projects/${pid}/pipelines?per_page=${max}`, h);
    }
    return getJSON(`${base}/api/v4/issues?scope=assigned_to_me&state=opened&per_page=${max}`, h);
  },
});

reg({
  id: "bitbucket", label: "Bitbucket", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "bitbucket.prs", label: "Open pull requests (workspace, repo)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const ws = (ctx.query.workspace || "").trim();
    const repo = (ctx.query.repo || "").trim();
    if (!ws || !repo) return null;
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    // payload: { values: [{ title, author, state, links }] }
    return getJSON(`https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(ws)}/${encodeURIComponent(repo)}/pullrequests?state=OPEN&pagelen=${max}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "sentry", label: "Sentry", category: "ops", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "sentry.issues", label: "Unresolved issues (org, project)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const org = (ctx.query.org || "").trim();
    const project = (ctx.query.project || "").trim();
    if (!org || !project) return null;
    // payload: array of { title, culprit, count, lastSeen }
    return getJSON(`https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is:unresolved&statsPeriod=24h`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "vercel", label: "Vercel", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "vercel.deployments", label: "Recent deployments", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    const team = ctx.query.teamId ? `&teamId=${encodeURIComponent(ctx.query.teamId)}` : "";
    // payload: { deployments: [{ name, state, url, created }] }
    return getJSON(`https://api.vercel.com/v6/deployments?limit=${max}${team}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "netlify", label: "Netlify", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [
    { id: "netlify.sites", label: "Sites", shape: "list" },
    { id: "netlify.deploys", label: "Site deploys (site_id)", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    if (ctx.resource === "netlify.deploys") {
      const id = (ctx.query.site_id || "").trim();
      if (!id) return null;
      return getJSON(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(id)}/deploys?per_page=${max}`, h);
    }
    return getJSON(`https://api.netlify.com/api/v1/sites?per_page=${max}`, h);
  },
});

reg({
  id: "cloudflare", label: "Cloudflare", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "cloudflare.zones", label: "Zones", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const max = Math.min(Number(ctx.query.max) || 20, 50);
    // payload: { result: [{ name, status, plan }] }
    return getJSON(`https://api.cloudflare.com/client/v4/zones?per_page=${max}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "circleci", label: "CircleCI", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "circleci.pipelines", label: "Project pipelines (project_slug, e.g. gh/org/repo)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const slug = (ctx.query.project_slug || "").trim();
    if (!slug) return null;
    // payload: { items: [{ number, state, vcs }] }
    return getJSON(`https://circleci.com/api/v2/project/${slug}/pipeline`, { "Circle-Token": ctx.secret });
  },
});

reg({
  id: "uptimerobot", label: "UptimeRobot", category: "ops", authKind: "apiKey",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "uptimerobot.monitors", label: "Monitors", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // payload: { monitors: [{ friendly_name, status, url }] } — POST with api_key in body
    return postJSON("https://api.uptimerobot.com/v2/getMonitors", { api_key: ctx.secret, format: "json" });
  },
});

reg({
  id: "statuspage", label: "Statuspage", category: "ops", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "statuspage.incidents", label: "Unresolved incidents (page_id)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const page = (ctx.query.page_id || "").trim();
    if (!page) return null;
    // payload: array of { name, status, impact, created_at }
    return getJSON(`https://api.statuspage.io/v1/pages/${encodeURIComponent(page)}/incidents/unresolved`, { Authorization: `OAuth ${ctx.secret}` });
  },
});

reg({
  id: "betteruptime", label: "Better Stack (Uptime)", category: "ops", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "betteruptime.monitors", label: "Monitors", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // payload: { data: [{ attributes: { pronounceable_name, status, url } }] }
    return getJSON("https://uptime.betterstack.com/api/v2/monitors", { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "pagerduty", label: "PagerDuty", category: "ops", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "pagerduty.incidents", label: "Triggered incidents", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    // payload: { incidents: [{ title, status, urgency, created_at }] }
    return getJSON(`https://api.pagerduty.com/incidents?statuses[]=triggered&limit=${max}`, {
      Authorization: `Token token=${ctx.secret}`, Accept: "application/vnd.pagerduty+json;version=2",
    });
  },
});

// ============================================================================
// Integrations B4 — productivity / project-management / time-tracking / bookmarks
// (paste a personal token / API key). Documented endpoints, raw payload → SourceMap.
// (Basecamp deferred to the OAuth batch — it's OAuth + account-scoped.)
// ============================================================================

reg({
  id: "clickup", label: "ClickUp", category: "tasks", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "clickup.tasks", label: "List tasks (list_id)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const list = (ctx.query.list_id || "").trim();
    if (!list) return null;
    // payload: { tasks: [{ name, status: { status }, due_date }] }
    return getJSON(`https://api.clickup.com/api/v2/list/${encodeURIComponent(list)}/task?archived=false`, { Authorization: ctx.secret });
  },
});

reg({
  id: "monday", label: "monday.com", category: "tasks", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "monday.items", label: "Board items (board_id)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const board = (ctx.query.board_id || "").replace(/\D/g, "");
    if (!board) return null;
    const max = Math.min(Number(ctx.query.max) || 25, 100);
    // payload: { data: { boards: [{ items_page: { items: [{ name }] } }] } }
    return postJSON(
      "https://api.monday.com/v2",
      { query: `query { boards (ids: ${board}) { items_page (limit: ${max}) { items { name } } } }` },
      { Authorization: ctx.secret },
    );
  },
});

reg({
  id: "height", label: "Height", category: "tasks", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "height.tasks", label: "Tasks", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // payload: { list: [{ name, status, index }] }
    return getJSON("https://api.height.app/tasks", { Authorization: `api-key ${ctx.secret}` });
  },
});

reg({
  id: "shortcut", label: "Shortcut", category: "issues", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "shortcut.stories", label: "Story search (query)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const q = (ctx.query.query || ctx.query.q || "owner:me !is:done").trim();
    // payload: { data: [{ name, story_type, app_url }] }
    return getJSON(`https://api.app.shortcut.com/api/v3/search/stories?query=${encodeURIComponent(q)}&page_size=${Math.min(Number(ctx.query.max) || 15, 25)}`, { "Shortcut-Token": ctx.secret });
  },
});

reg({
  id: "harvest", label: "Harvest", category: "time-tracking", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "harvest.timeEntries", label: "Recent time entries", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const account = (ctx.config.accountId as string) || ctx.query.account_id || "";
    if (!account) return null;
    // payload: { time_entries: [{ hours, notes, spent_date, client: { name } }] }
    return getJSON("https://api.harvestapp.com/v2/time_entries", {
      Authorization: `Bearer ${ctx.secret}`, "Harvest-Account-Id": String(account), "User-Agent": "glanceos",
    });
  },
});

reg({
  id: "toggl", label: "Toggl Track", category: "time-tracking", authKind: "token",
  defaultTtlMs: TTL.min, minRefreshMs: 60_000,
  resources: [{ id: "toggl.current", label: "Running timer", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const auth = `Basic ${Buffer.from(`${ctx.secret}:api_token`).toString("base64")}`;
    // payload: { description, duration, start } or null when no timer is running
    const raw = (await getJSON("https://api.track.toggl.com/api/v9/me/time_entries/current", { Authorization: auth })) as
      { description?: string; duration?: number; start?: string } | null;
    return { value: raw?.description || "No timer running", running: !!raw, start: raw?.start ?? "" };
  },
});

reg({
  id: "wakatime", label: "WakaTime", category: "dev", authKind: "token",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  resources: [{ id: "wakatime.stats", label: "Coding stats (last 7 days)", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const auth = `Basic ${Buffer.from(ctx.secret).toString("base64")}`;
    const range = ["last_7_days", "last_30_days", "today"].includes(ctx.query.range || "") ? ctx.query.range : "last_7_days";
    // payload: { data: { human_readable_total, languages: [{ name, percent }] } }
    const raw = (await getJSON(`https://wakatime.com/api/v1/users/current/stats/${range}`, { Authorization: auth })) as
      { data?: { human_readable_total?: string; languages?: { name?: string; percent?: number }[] } } | null;
    const langs = (raw?.data?.languages ?? []).slice(0, 6).map((l) => ({ title: l.name ?? "", value: `${Math.round(l.percent ?? 0)}%` }));
    return { value: raw?.data?.human_readable_total || "—", label: "coding time", items: langs };
  },
});

reg({
  id: "airtable", label: "Airtable", category: "docs", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "airtable.records", label: "Table records (base_id, table)", shape: "table" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = (ctx.query.base_id || "").trim();
    const table = (ctx.query.table || "").trim();
    if (!base || !table) return null;
    const max = Math.min(Number(ctx.query.max) || 20, 100);
    // payload: { records: [{ fields: {...} }] }
    return getJSON(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}?maxRecords=${max}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "pinboard", label: "Pinboard", category: "bookmarks", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 5 * 60_000,
  resources: [{ id: "pinboard.recent", label: "Recent bookmarks", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null; // secret is the "user:TOKEN" auth token
    const count = Math.min(Number(ctx.query.max) || 12, 100);
    // payload: { posts: [{ description, href, tags }] }
    return getJSON(`https://api.pinboard.in/v1/posts/recent?count=${count}&format=json&auth_token=${encodeURIComponent(ctx.secret)}`);
  },
});

reg({
  id: "raindrop", label: "Raindrop.io", category: "bookmarks", authKind: "token",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "raindrop.bookmarks", label: "Bookmarks (collection_id, 0 = all)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const coll = (ctx.query.collection_id || "0").replace(/[^\d-]/g, "") || "0";
    const max = Math.min(Number(ctx.query.max) || 15, 50);
    // payload: { items: [{ title, link, excerpt }] }
    return getJSON(`https://api.raindrop.io/rest/v1/raindrops/${coll}?perpage=${max}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

// ============================================================================
// Integrations B5 — money / analytics providers (paste a secret/restricted key
// or API key). Documented endpoints, raw payload → SourceMap.
// ============================================================================

reg({
  id: "stripe", label: "Stripe", category: "money", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 5 * 60_000,
  resources: [
    { id: "stripe.balance", label: "Account balance", shape: "scalar" },
    { id: "stripe.charges", label: "Recent charges", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null; // use a restricted (read-only) key
    const h = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "stripe.charges") {
      const max = Math.min(Number(ctx.query.max) || 10, 50);
      return getJSON(`https://api.stripe.com/v1/charges?limit=${max}`, h); // { data: [{ amount, currency, status, created }] }
    }
    const raw = (await getJSON("https://api.stripe.com/v1/balance", h)) as
      { available?: { amount?: number; currency?: string }[] } | null;
    const a = raw?.available?.[0];
    return { value: a ? (a.amount ?? 0) / 100 : 0, label: (a?.currency ?? "usd").toUpperCase() + " available" };
  },
});

reg({
  id: "ynab", label: "YNAB", category: "money", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 5 * 60_000,
  resources: [
    { id: "ynab.budgets", label: "Budgets", shape: "list" },
    { id: "ynab.accounts", label: "Accounts (budget_id, or last-used)", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "ynab.accounts") {
      const budget = (ctx.query.budget_id || "last-used").trim();
      return getJSON(`https://api.ynab.com/v1/budgets/${encodeURIComponent(budget)}/accounts`, h); // { data: { accounts: [{ name, balance }] } }
    }
    return getJSON("https://api.ynab.com/v1/budgets", h); // { data: { budgets: [{ name }] } }
  },
});

reg({
  id: "plausible", label: "Plausible Analytics", category: "analytics", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "plausible.aggregate", label: "Site totals (site_id)", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const site = (ctx.query.site_id || "").trim();
    if (!site) return null;
    const base = ((ctx.config.baseUrl as string) || "https://plausible.io").replace(/\/+$/, "");
    const period = ["day", "7d", "30d", "month"].includes(ctx.query.period || "") ? ctx.query.period : "7d";
    // payload: { results: { visitors: { value }, pageviews: { value } } }
    return getJSON(`${base}/api/v1/stats/aggregate?site_id=${encodeURIComponent(site)}&period=${period}&metrics=visitors,pageviews,bounce_rate`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "umami", label: "Umami Analytics", category: "analytics", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "umami.stats", label: "Website stats (website_id)", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const id = (ctx.query.website_id || "").trim();
    const base = ((ctx.config.baseUrl as string) || "https://api.umami.is").replace(/\/+$/, "");
    if (!id) return null;
    const end = Date.now();
    const start = end - 7 * 24 * 60 * 60 * 1000;
    // payload: { pageviews: { value }, visitors: { value }, visits: { value } }
    return getJSON(`${base}/api/websites/${encodeURIComponent(id)}/stats?startAt=${start}&endAt=${end}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "fathom", label: "Fathom Analytics", category: "analytics", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "fathom.aggregations", label: "Site aggregates (entity_id)", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const site = (ctx.query.entity_id || ctx.query.site_id || "").trim();
    if (!site) return null;
    // payload: [{ visits, pageviews }]
    return getJSON(`https://api.usefathom.com/v1/aggregations?entity=pageview&entity_id=${encodeURIComponent(site)}&aggregates=visits,pageviews,uniques&date_from=${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "posthog", label: "PostHog", category: "analytics", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "posthog.insights", label: "Saved insights (project_id)", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const project = (ctx.query.project_id || "").replace(/\D/g, "");
    if (!project) return null;
    const base = ((ctx.config.baseUrl as string) || "https://app.posthog.com").replace(/\/+$/, "");
    // payload: { results: [{ name, derived_name }] }
    return getJSON(`${base}/api/projects/${project}/insights/?limit=${Math.min(Number(ctx.query.max) || 12, 25)}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "simpleanalytics", label: "Simple Analytics", category: "analytics", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "simpleanalytics.stats", label: "Site stats (hostname)", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const host = (ctx.query.hostname || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!host) return null;
    const h: Record<string, string> = { "Api-Key": ctx.secret };
    if (ctx.config.userId) h["User-Id"] = String(ctx.config.userId);
    // payload: { pageviews, visitors }
    return getJSON(`https://simpleanalytics.com/${encodeURIComponent(host)}.json?version=5&fields=pageviews,visitors&start=today-7d&end=today`, h);
  },
});

reg({
  id: "lemonsqueezy", label: "Lemon Squeezy", category: "money", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "lemonsqueezy.orders", label: "Recent orders", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    // payload: { data: [{ attributes: { total, status, created_at, user_email } }] }
    return getJSON(`https://api.lemonsqueezy.com/v1/orders?page[size]=${max}`, {
      Authorization: `Bearer ${ctx.secret}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json",
    });
  },
});

reg({
  id: "paddle", label: "Paddle", category: "money", authKind: "token",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [{ id: "paddle.transactions", label: "Recent transactions", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = ((ctx.config.baseUrl as string) || "https://api.paddle.com").replace(/\/+$/, "");
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    // payload: { data: [{ id, status, details: { totals: { total, currency_code } }, created_at }] }
    return getJSON(`${base}/transactions?per_page=${max}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "openexchangerates", label: "Open Exchange Rates", category: "finance", authKind: "apiKey",
  defaultTtlMs: TTL.h1, minRefreshMs: 10 * 60_000,
  resources: [{ id: "openexchangerates.latest", label: "Latest rates", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null; // app_id
    const base = (ctx.query.base || "USD").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
    const syms = (ctx.query.symbols || "").toUpperCase().replace(/[^A-Z,]/g, "");
    const symParam = syms ? `&symbols=${syms}` : "";
    // payload: { base, rates: { EUR: …, GBP: … } } — free plan only supports base=USD
    return getJSON(`https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(ctx.secret)}&base=${base}${symParam}`);
  },
});

// ============================================================================
// Integrations B6 — health / fitness / media providers. OAuth (strava, whoop)
// scaffold an oauth spec + bearer resolve; the rest take an API key / token.
// Self-hosted media servers (plex, tautulli, sonarr, radarr) need a baseUrl and,
// for private hosts, GLANCEOS_ALLOW_PRIVATE_EGRESS=1. (Withings deferred —
// non-standard OAuth token exchange the generic flow can't do.)
// ============================================================================

reg({
  id: "strava", label: "Strava", category: "health", authKind: "oauth2",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  oauth: {
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    scopes: ["activity:read_all"],
    authParams: { approval_prompt: "auto" },
  },
  resources: [
    { id: "strava.activities", label: "Recent activities", shape: "list" },
    { id: "strava.stats", label: "Athlete totals (athlete_id)", shape: "scalar" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "strava.stats") {
      const id = (ctx.query.athlete_id || "").replace(/\D/g, "");
      if (!id) return null;
      return getJSON(`https://www.strava.com/api/v3/athletes/${id}/stats`, h); // { recent_run_totals, ytd_run_totals, … }
    }
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    // payload: array of { name, distance, moving_time, type, start_date }
    return getJSON(`https://www.strava.com/api/v3/athlete/activities?per_page=${max}`, h);
  },
});

reg({
  id: "whoop", label: "WHOOP", category: "health", authKind: "oauth2",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  oauth: {
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    scopes: ["read:recovery", "read:sleep", "read:cycles", "offline"],
  },
  resources: [
    { id: "whoop.recovery", label: "Recovery", shape: "list" },
    { id: "whoop.sleep", label: "Sleep", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    const max = Math.min(Number(ctx.query.max) || 7, 25);
    const ep = ctx.resource === "whoop.sleep" ? "activity/sleep" : "recovery";
    // payload: { records: [{ score: { … } }] }
    return getJSON(`https://api.prod.whoop.com/developer/v1/${ep}?limit=${max}`, h);
  },
});

reg({
  id: "lastfm", label: "Last.fm", category: "media", authKind: "apiKey",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [
    { id: "lastfm.recent", label: "Recent tracks (user)", shape: "list" },
    { id: "lastfm.topartists", label: "Top artists (user)", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null; // api_key
    const user = (ctx.query.user || "").trim();
    if (!user) return null;
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    const method = ctx.resource === "lastfm.topartists" ? "user.gettopartists" : "user.getrecenttracks";
    // payload: { recenttracks: { track: [{ name, artist: { #text } }] } } or { topartists: { artist: [...] } }
    return getJSON(`https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(ctx.secret)}&format=json&limit=${max}`);
  },
});

reg({
  id: "trakt", label: "Trakt", category: "media", authKind: "apiKey",
  defaultTtlMs: TTL.h1, minRefreshMs: 5 * 60_000,
  resources: [
    { id: "trakt.trendingShows", label: "Trending shows", shape: "list" },
    { id: "trakt.trendingMovies", label: "Trending movies", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null; // client_id
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const kind = ctx.resource === "trakt.trendingMovies" ? "movies" : "shows";
    const h = { "trakt-api-version": "2", "trakt-api-key": ctx.secret };
    // payload: array of { watchers, show|movie: { title, year } }
    return getJSON(`https://api.trakt.tv/${kind}/trending?limit=${max}`, h);
  },
});

reg({
  id: "listenbrainz", label: "ListenBrainz", category: "media", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [{ id: "listenbrainz.listens", label: "Recent listens (user)", shape: "list" }],
  async resolve(ctx) {
    const user = (ctx.query.user || "").trim();
    if (!user) return null;
    const max = Math.min(Number(ctx.query.max) || 10, 50);
    const h: Record<string, string> = ctx.secret ? { Authorization: `Token ${ctx.secret}` } : {};
    // payload: { payload: { listens: [{ track_metadata: { track_name, artist_name } }] } }
    return getJSON(`https://api.listenbrainz.org/1/user/${encodeURIComponent(user)}/listens?count=${max}`, h);
  },
});

reg({
  id: "plex", label: "Plex", category: "media", authKind: "token",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  resources: [
    { id: "plex.recentlyAdded", label: "Recently added", shape: "list" },
    { id: "plex.sessions", label: "Now playing", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null; // X-Plex-Token
    const base = ((ctx.config.baseUrl as string) || "").replace(/\/+$/, "");
    if (!base) return null;
    const path = ctx.resource === "plex.sessions" ? "/status/sessions" : "/library/recentlyAdded?X-Plex-Container-Size=12";
    const sep = path.includes("?") ? "&" : "?";
    // payload: { MediaContainer: { Metadata: [{ title, type, year }] } }
    return getJSON(`${base}${path}${sep}X-Plex-Token=${encodeURIComponent(ctx.secret)}`, { Accept: "application/json" });
  },
});

reg({
  id: "tautulli", label: "Tautulli", category: "media", authKind: "apiKey",
  defaultTtlMs: TTL.min, minRefreshMs: 60_000,
  resources: [{ id: "tautulli.activity", label: "Current activity", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = ((ctx.config.baseUrl as string) || "").replace(/\/+$/, "");
    if (!base) return null;
    // payload: { response: { data: { stream_count, sessions: [...] } } }
    return getJSON(`${base}/api/v2?apikey=${encodeURIComponent(ctx.secret)}&cmd=get_activity`);
  },
});

reg({
  id: "sonarr", label: "Sonarr", category: "media", authKind: "apiKey",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [
    { id: "sonarr.calendar", label: "Upcoming episodes", shape: "list" },
    { id: "sonarr.queue", label: "Download queue", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = ((ctx.config.baseUrl as string) || "").replace(/\/+$/, "");
    if (!base) return null;
    const h = { "X-Api-Key": ctx.secret };
    if (ctx.resource === "sonarr.queue") return getJSON(`${base}/api/v3/queue`, h);
    const end = new Date(Date.now() + 14 * 864e5).toISOString();
    // payload: array of { title, airDateUtc, series: { title } }
    return getJSON(`${base}/api/v3/calendar?end=${encodeURIComponent(end)}`, h);
  },
});

reg({
  id: "radarr", label: "Radarr", category: "media", authKind: "apiKey",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  resources: [
    { id: "radarr.calendar", label: "Upcoming releases", shape: "list" },
    { id: "radarr.queue", label: "Download queue", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const base = ((ctx.config.baseUrl as string) || "").replace(/\/+$/, "");
    if (!base) return null;
    const h = { "X-Api-Key": ctx.secret };
    if (ctx.resource === "radarr.queue") return getJSON(`${base}/api/v3/queue`, h);
    const end = new Date(Date.now() + 30 * 864e5).toISOString();
    // payload: array of { title, inCinemas, digitalRelease }
    return getJSON(`${base}/api/v3/calendar?end=${encodeURIComponent(end)}`, h);
  },
});

// ============================================================================
// Integrations B7 — OAuth scaffolds. Each declares an oauth spec (authorize/token
// URLs + scopes) so it appears on the Integrations page and connects via the
// existing /oauth flow; resolve() reads the bearer token. Verify-by-construction
// (no creds to live-test). (reddit-oauth skipped — id collides with the keyless
// reddit provider; withings/garmin remain deferred for non-standard OAuth.)
// ============================================================================

reg({
  id: "discord", label: "Discord", category: "social", authKind: "oauth2",
  defaultTtlMs: TTL.m15, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: ["identify", "guilds"],
    tokenAuth: "basic",
  },
  resources: [
    { id: "discord.guilds", label: "My servers", shape: "list" },
    { id: "discord.user", label: "My profile", shape: "scalar" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "discord.user") return getJSON("https://discord.com/api/users/@me", h); // { username, global_name }
    return getJSON("https://discord.com/api/users/@me/guilds", h); // array of { name, id }
  },
});

reg({
  id: "twitch", label: "Twitch", category: "gaming", authKind: "oauth2",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: ["user:read:follows"],
  },
  resources: [{ id: "twitch.user", label: "My channel", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // Helix needs the app Client-Id header too; paste it as a config field (clientId).
    const h: Record<string, string> = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.config.clientId) h["Client-Id"] = String(ctx.config.clientId);
    // payload: { data: [{ display_name, view_count, broadcaster_type }] }
    return getJSON("https://api.twitch.tv/helix/users", h);
  },
});

reg({
  id: "dropbox", label: "Dropbox", category: "docs", authKind: "oauth2",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  oauth: {
    authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["account_info.read"],
    authParams: { token_access_type: "offline" },
  },
  resources: [{ id: "dropbox.space", label: "Storage usage", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // RPC endpoint: POST with a null body. payload: { used, allocation: { allocated } }
    const raw = (await postJSON("https://api.dropboxapi.com/2/users/get_space_usage", null, { Authorization: `Bearer ${ctx.secret}` })) as
      { used?: number; allocation?: { allocated?: number } } | null;
    const used = Number(raw?.used ?? 0), total = Number(raw?.allocation?.allocated ?? 0);
    return { value: Math.round(used / 1e9 * 10) / 10, label: total ? `of ${Math.round(total / 1e9)} GB used` : "GB used" };
  },
});

reg({
  id: "calendly", label: "Calendly", category: "calendar", authKind: "oauth2",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    scopes: [],
  },
  resources: [
    { id: "calendly.me", label: "My account", shape: "scalar" },
    { id: "calendly.events", label: "Scheduled events (user URI)", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "calendly.events") {
      const uri = (ctx.query.user || "").trim();
      if (!uri) return null;
      const max = Math.min(Number(ctx.query.max) || 10, 50);
      // payload: { collection: [{ name, start_time, status }] }
      return getJSON(`https://api.calendly.com/scheduled_events?user=${encodeURIComponent(uri)}&count=${max}&sort=start_time:asc`, h);
    }
    return getJSON("https://api.calendly.com/users/me", h); // { resource: { name, scheduling_url } }
  },
});

reg({
  id: "zoom", label: "Zoom", category: "calendar", authKind: "oauth2",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    scopes: ["meeting:read"],
    tokenAuth: "basic",
  },
  resources: [{ id: "zoom.meetings", label: "Upcoming meetings", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // payload: { meetings: [{ topic, start_time, join_url }] }
    return getJSON("https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=20", { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "figma", label: "Figma", category: "dev", authKind: "oauth2",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  oauth: {
    authorizeUrl: "https://www.figma.com/oauth",
    tokenUrl: "https://www.figma.com/api/oauth/token",
    scopes: ["files:read"],
  },
  resources: [{ id: "figma.me", label: "My account", shape: "scalar" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // payload: { handle, email, img_url }
    return getJSON("https://api.figma.com/v1/me", { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "coinbase", label: "Coinbase", category: "finance", authKind: "oauth2",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://www.coinbase.com/oauth/authorize",
    tokenUrl: "https://api.coinbase.com/oauth/token",
    scopes: ["wallet:accounts:read"],
  },
  resources: [{ id: "coinbase.accounts", label: "Wallet balances", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    // payload: { data: [{ name, balance: { amount, currency } }] }
    return getJSON("https://api.coinbase.com/v2/accounts", { Authorization: `Bearer ${ctx.secret}`, "CB-VERSION": "2024-01-01" });
  },
});

reg({
  id: "googletasks", label: "Google Tasks", category: "tasks", authKind: "oauth2",
  defaultTtlMs: TTL.m5, minRefreshMs: 60_000,
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/tasks.readonly"],
    authParams: { access_type: "offline", prompt: "consent" },
  },
  resources: [{ id: "googletasks.tasks", label: "Default list tasks", shape: "list" }],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const list = (ctx.query.tasklist || "@default").trim();
    // payload: { items: [{ title, status, due }] }
    return getJSON(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks?showCompleted=false&maxResults=${Math.min(Number(ctx.query.max) || 20, 100)}`, { Authorization: `Bearer ${ctx.secret}` });
  },
});

reg({
  id: "youtube", label: "YouTube", category: "media", authKind: "oauth2",
  defaultTtlMs: TTL.m30, minRefreshMs: 5 * 60_000,
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    authParams: { access_type: "offline", prompt: "consent" },
  },
  resources: [
    { id: "youtube.stats", label: "My channel stats", shape: "scalar" },
    { id: "youtube.subscriptions", label: "My subscriptions", shape: "list" },
  ],
  async resolve(ctx) {
    if (!ctx.secret) return null;
    const h = { Authorization: `Bearer ${ctx.secret}` };
    if (ctx.resource === "youtube.subscriptions") {
      const max = Math.min(Number(ctx.query.max) || 12, 50);
      // payload: { items: [{ snippet: { title } }] }
      return getJSON(`https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=${max}&order=unread`, h);
    }
    // payload: { items: [{ statistics: { subscriberCount, viewCount, videoCount } }] }
    return getJSON("https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true", h);
  },
});

// ---- E1: more keyless public-data providers (render immediately, no login) ----

reg({
  id: "hackernews", label: "Hacker News", category: "news", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [
    { id: "hackernews.top", label: "Front page", shape: "list" },
    { id: "hackernews.search", label: "Search stories", shape: "list" },
  ],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const q = (ctx.query.q || "").trim();
    const url = q
      ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${max}`
      : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${max}`;
    const raw = (await getJSON(url, UA)) as { hits?: { title?: string; points?: number; num_comments?: number; url?: string; objectID?: string }[] } | null;
    const items = (raw?.hits ?? []).map((h) => ({
      title: h.title ?? "",
      score: Number(h.points ?? 0),
      comments: Number(h.num_comments ?? 0),
      url: h.url || (h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : ""),
    }));
    return { items };
  },
});

reg({
  id: "wikipedia", label: "Wikipedia", category: "reference", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60_000,
  resources: [
    { id: "wikipedia.onthisday", label: "On this day", shape: "list" },
    { id: "wikipedia.search", label: "Search", shape: "list" },
  ],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    if (ctx.resource === "wikipedia.search") {
      const q = (ctx.query.q || "").trim();
      const raw = (await getJSON(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=${max}`, UA)) as
        { pages?: { title?: string; description?: string }[] } | null;
      return { items: (raw?.pages ?? []).map((p) => ({ title: p.title ?? "", label: p.description ?? "" })) };
    }
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const raw = (await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, UA)) as
      { events?: { year?: number; text?: string }[] } | null;
    return { items: (raw?.events ?? []).slice(0, max).map((e) => ({ title: `${e.year ?? ""} — ${e.text ?? ""}` })) };
  },
});

reg({
  id: "frankfurter", label: "Frankfurter (FX)", category: "finance", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 60_000,
  resources: [{ id: "frankfurter.rates", label: "Exchange rates", shape: "list" }],
  async resolve(ctx) {
    const from = ((ctx.query.from || "USD").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)) || "USD";
    const to = (ctx.query.to || "EUR,GBP,INR,JPY").toUpperCase().replace(/[^A-Z,]/g, "");
    const raw = (await getJSON(`https://api.frankfurter.app/latest?from=${from}&to=${encodeURIComponent(to)}`, UA)) as
      { base?: string; rates?: Record<string, number> } | null;
    const items = Object.entries(raw?.rates ?? {}).map(([code, value]) => ({ text: `${from}→${code}`, value: Number(value) }));
    return { items, base: raw?.base ?? from };
  },
});

reg({
  id: "iss", label: "ISS tracker", category: "space", authKind: "none",
  defaultTtlMs: TTL.min, minRefreshMs: 15_000,
  resources: [{ id: "iss.position", label: "Live position", shape: "list" }],
  async resolve() {
    const raw = (await getJSON("https://api.wheretheiss.at/v1/satellites/25544", UA)) as
      { latitude?: number; longitude?: number; altitude?: number; velocity?: number } | null;
    const r = (n: unknown, p = 2) => Number(Number(n ?? 0).toFixed(p));
    const items = [
      { text: "Latitude", value: r(raw?.latitude) },
      { text: "Longitude", value: r(raw?.longitude) },
      { text: "Altitude (km)", value: r(raw?.altitude, 1) },
      { text: "Speed (km/h)", value: r(raw?.velocity, 0) },
    ];
    return { items, value: r(raw?.altitude, 1) };
  },
});

reg({
  id: "spaceflightnews", label: "Spaceflight News", category: "space", authKind: "none",
  defaultTtlMs: TTL.m30, minRefreshMs: 60_000,
  resources: [{ id: "spaceflightnews.articles", label: "Articles", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const raw = (await getJSON(`https://api.spaceflightnewsapi.net/v4/articles/?limit=${max}`, UA)) as
      { results?: { title?: string; news_site?: string; url?: string }[] } | null;
    return { items: (raw?.results ?? []).map((a) => ({ title: a.title ?? "", label: a.news_site ?? "", url: a.url ?? "" })) };
  },
});

reg({
  id: "nager", label: "Public Holidays", category: "calendar", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 60_000,
  resources: [{ id: "nager.next", label: "Upcoming holidays", shape: "list" }],
  async resolve(ctx) {
    const country = ((ctx.query.country || "US").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2)) || "US";
    const max = Math.min(Number(ctx.query.max) || 10, 24);
    const raw = (await getJSON(`https://date.nager.at/api/v3/NextPublicHolidays/${country}`, UA)) as
      { date?: string; localName?: string; name?: string }[] | null;
    return { items: (raw ?? []).slice(0, max).map((h) => ({ title: h.localName || h.name || "", label: h.date ?? "" })) };
  },
});

reg({
  id: "gutendex", label: "Project Gutenberg", category: "books", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60_000,
  resources: [{ id: "gutendex.search", label: "Book search", shape: "list" }],
  async resolve(ctx) {
    const q = (ctx.query.q || "").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 24);
    const raw = (await getJSON(`https://gutendex.com/books?search=${encodeURIComponent(q)}`, UA)) as
      { results?: { title?: string; authors?: { name?: string }[]; download_count?: number }[] } | null;
    return { items: (raw?.results ?? []).slice(0, max).map((b) => ({ title: b.title ?? "", label: b.authors?.[0]?.name ?? "", value: Number(b.download_count ?? 0) })) };
  },
});

reg({
  id: "dictionary", label: "Dictionary", category: "reference", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 30_000,
  resources: [{ id: "dictionary.define", label: "Definitions", shape: "list" }],
  async resolve(ctx) {
    const word = (ctx.query.word || "serendipity").trim().replace(/[^\w'-]/g, "");
    const raw = (await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, UA)) as
      { word?: string; meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[] }[] | null;
    const items: { title: string }[] = [];
    for (const m of raw?.[0]?.meanings ?? []) {
      for (const def of m.definitions ?? []) {
        if (def.definition) items.push({ title: `(${m.partOfSpeech ?? ""}) ${def.definition}` });
      }
    }
    return { items, word: raw?.[0]?.word ?? word };
  },
});

reg({
  id: "quotable", label: "Quotable", category: "reference", authKind: "none",
  defaultTtlMs: TTL.m30, minRefreshMs: 15_000,
  resources: [{ id: "quotable.random", label: "Random quotes", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 1, 20);
    const tags = (ctx.query.tags || "").trim();
    const url = `https://api.quotable.io/quotes/random?limit=${max}${tags ? `&tags=${encodeURIComponent(tags)}` : ""}`;
    const raw = (await getJSON(url, UA)) as { content?: string; author?: string }[] | null;
    return { items: (raw ?? []).map((q) => ({ title: q.content ?? "", label: q.author ?? "" })) };
  },
});

reg({
  id: "xkcd", label: "xkcd", category: "fun", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60_000,
  resources: [{ id: "xkcd.latest", label: "Latest comic", shape: "scalar" }],
  async resolve() {
    const raw = (await getJSON("https://xkcd.com/info.0.json", UA)) as
      { num?: number; title?: string; alt?: string; img?: string } | null;
    return { value: raw?.title ? `#${raw.num}: ${raw.title}` : "", title: raw?.title ?? "", num: raw?.num ?? 0, alt: raw?.alt ?? "", img: raw?.img ?? "" };
  },
});

reg({
  id: "freetogame", label: "Free-to-Play Games", category: "gaming", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60_000,
  resources: [{ id: "freetogame.games", label: "Games", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 30);
    const params = new URLSearchParams({ "sort-by": ctx.query.sort || "popularity" });
    if (ctx.query.platform) params.set("platform", ctx.query.platform);
    if (ctx.query.category) params.set("category", ctx.query.category);
    const raw = (await getJSON(`https://www.freetogame.com/api/games?${params.toString()}`, UA)) as
      { title?: string; genre?: string; game_url?: string }[] | null;
    return { items: (raw ?? []).slice(0, max).map((g) => ({ title: g.title ?? "", label: g.genre ?? "", url: g.game_url ?? "" })) };
  },
});

reg({
  id: "binance", label: "Binance (crypto)", category: "finance", authKind: "none",
  defaultTtlMs: TTL.m5, minRefreshMs: 15_000,
  resources: [{ id: "binance.tickers", label: "24h tickers", shape: "list" }],
  async resolve(ctx) {
    const syms = (ctx.query.symbols || "BTCUSDT,ETHUSDT,SOLUSDT").toUpperCase().replace(/[^A-Z0-9,]/g, "").split(",").filter(Boolean).slice(0, 20);
    const param = encodeURIComponent(JSON.stringify(syms));
    const raw = (await getJSON(`https://api.binance.com/api/v3/ticker/24hr?symbols=${param}`, UA)) as
      { symbol?: string; lastPrice?: string; priceChangePercent?: string }[] | null;
    const items = (raw ?? []).map((t) => ({
      text: t.symbol ?? "",
      value: Number(t.lastPrice ?? 0),
      label: t.priceChangePercent ? `${Number(t.priceChangePercent).toFixed(2)}%` : "",
    }));
    return { items };
  },
});

// ---- E2: more keyless public-data providers (food, art, space, markets, fun) ----

// Minimal HTML-entity decode for APIs (e.g. Open Trivia DB) that return encoded text.
const unesc = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

reg({
  id: "themealdb", label: "TheMealDB (recipes)", category: "food", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 30_000,
  resources: [
    { id: "themealdb.search", label: "Recipe search", shape: "list" },
    { id: "themealdb.random", label: "Random meal", shape: "scalar" },
  ],
  async resolve(ctx) {
    if (ctx.resource === "themealdb.random") {
      const raw = (await getJSON("https://www.themealdb.com/api/json/v1/1/random.php", UA)) as { meals?: { strMeal?: string; strCategory?: string }[] } | null;
      const m = raw?.meals?.[0];
      return { value: m?.strMeal ?? "", category: m?.strCategory ?? "" };
    }
    const q = (ctx.query.q || "").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`, UA)) as
      { meals?: { strMeal?: string; strCategory?: string; strArea?: string }[] } | null;
    return { items: (raw?.meals ?? []).slice(0, max).map((m) => ({ title: m.strMeal ?? "", label: [m.strArea, m.strCategory].filter(Boolean).join(" · ") })) };
  },
});

reg({
  id: "thecocktaildb", label: "TheCocktailDB", category: "food", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 30_000,
  resources: [
    { id: "thecocktaildb.search", label: "Cocktail search", shape: "list" },
    { id: "thecocktaildb.random", label: "Random cocktail", shape: "scalar" },
  ],
  async resolve(ctx) {
    if (ctx.resource === "thecocktaildb.random") {
      const raw = (await getJSON("https://www.thecocktaildb.com/api/json/v1/1/random.php", UA)) as { drinks?: { strDrink?: string; strGlass?: string }[] } | null;
      const d = raw?.drinks?.[0];
      return { value: d?.strDrink ?? "", glass: d?.strGlass ?? "" };
    }
    const q = (ctx.query.q || "margarita").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`, UA)) as
      { drinks?: { strDrink?: string; strCategory?: string; strAlcoholic?: string }[] } | null;
    return { items: (raw?.drinks ?? []).slice(0, max).map((d) => ({ title: d.strDrink ?? "", label: [d.strAlcoholic, d.strCategory].filter(Boolean).join(" · ") })) };
  },
});

reg({
  id: "spacex", label: "SpaceX", category: "space", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 60_000,
  resources: [{ id: "spacex.upcoming", label: "Upcoming launches", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 8, 20);
    const raw = (await getJSON("https://api.spacexdata.com/v5/launches/upcoming", UA)) as { name?: string; date_utc?: string }[] | null;
    return { items: (raw ?? []).slice(0, max).map((l) => ({ title: l.name ?? "", label: l.date_utc ? l.date_utc.slice(0, 10) : "" })) };
  },
});

reg({
  id: "coinpaprika", label: "Coinpaprika", category: "finance", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 30_000,
  resources: [
    { id: "coinpaprika.tickers", label: "Top coins", shape: "list" },
    { id: "coinpaprika.global", label: "Market cap", shape: "scalar" },
  ],
  async resolve(ctx) {
    if (ctx.resource === "coinpaprika.global") {
      const raw = (await getJSON("https://api.coinpaprika.com/v1/global", UA)) as { market_cap_usd?: number; bitcoin_dominance_percentage?: number } | null;
      return { value: Number(raw?.market_cap_usd ?? 0), btcDominance: Number(raw?.bitcoin_dominance_percentage ?? 0) };
    }
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://api.coinpaprika.com/v1/tickers?limit=${max}`, UA)) as
      { name?: string; symbol?: string; quotes?: { USD?: { price?: number; percent_change_24h?: number } } }[] | null;
    return { items: (raw ?? []).slice(0, max).map((c) => ({
      text: c.symbol ?? "",
      value: Number(c.quotes?.USD?.price ?? 0),
      label: c.quotes?.USD?.percent_change_24h != null ? `${Number(c.quotes.USD.percent_change_24h).toFixed(2)}%` : "",
    })) };
  },
});

reg({
  id: "artic", label: "Art Institute of Chicago", category: "art", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 60_000,
  resources: [
    { id: "artic.artworks", label: "Artworks", shape: "list" },
    { id: "artic.search", label: "Search", shape: "list" },
  ],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const fields = "fields=title,artist_display,date_display";
    const q = (ctx.query.q || "").trim();
    const url = ctx.resource === "artic.search" && q
      ? `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&limit=${max}&${fields}`
      : `https://api.artic.edu/api/v1/artworks?limit=${max}&${fields}`;
    const raw = (await getJSON(url, UA)) as { data?: { title?: string; artist_display?: string; date_display?: string }[] } | null;
    return { items: (raw?.data ?? []).map((a) => ({ title: a.title ?? "", label: [a.artist_display, a.date_display].filter(Boolean).join(" · ").replace(/\n/g, " ") })) };
  },
});

reg({
  id: "poetrydb", label: "PoetryDB", category: "reference", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 30_000,
  resources: [{ id: "poetrydb.random", label: "A random poem", shape: "list" }],
  async resolve(ctx) {
    const author = (ctx.query.author || "").trim();
    const url = author ? `https://poetrydb.org/author/${encodeURIComponent(author)}` : "https://poetrydb.org/random";
    const raw = (await getJSON(url, UA)) as { title?: string; author?: string; lines?: string[] }[] | null;
    const poem = raw?.[0];
    const max = Math.min(Number(ctx.query.max) || 12, 40);
    return { items: (poem?.lines ?? []).slice(0, max).map((l) => ({ text: l })), title: poem?.title ?? "", author: poem?.author ?? "" };
  },
});

reg({
  id: "opentdb", label: "Open Trivia DB", category: "fun", authKind: "none",
  defaultTtlMs: TTL.m30, minRefreshMs: 15_000,
  resources: [{ id: "opentdb.questions", label: "Trivia questions", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 20);
    const raw = (await getJSON(`https://opentdb.com/api.php?amount=${max}&type=multiple`, UA)) as
      { results?: { question?: string; category?: string; difficulty?: string }[] } | null;
    return { items: (raw?.results ?? []).map((q) => ({ title: unesc(q.question ?? ""), label: q.category ? unesc(q.category) : "" })) };
  },
});

reg({
  id: "datamuse", label: "Datamuse (words)", category: "reference", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 15_000,
  resources: [{ id: "datamuse.related", label: "Related words", shape: "list" }],
  async resolve(ctx) {
    const word = (ctx.query.word || "calm").trim().replace(/[^\w' -]/g, "");
    const rel = ctx.query.rel === "rhyme" ? `rel_rhy=${encodeURIComponent(word)}` : `ml=${encodeURIComponent(word)}`;
    const max = Math.min(Number(ctx.query.max) || 12, 30);
    const raw = (await getJSON(`https://api.datamuse.com/words?${rel}&max=${max}`, UA)) as { word?: string; score?: number }[] | null;
    return { items: (raw ?? []).map((w) => ({ text: w.word ?? "", value: Number(w.score ?? 0) })) };
  },
});

reg({
  id: "openbrewerydb", label: "Open Brewery DB", category: "food", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 60_000,
  resources: [{ id: "openbrewerydb.byCity", label: "Breweries by city", shape: "list" }],
  async resolve(ctx) {
    const city = (ctx.query.city || "portland").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://api.openbrewerydb.org/v1/breweries?by_city=${encodeURIComponent(city)}&per_page=${max}`, UA)) as
      { name?: string; brewery_type?: string; city?: string; state?: string }[] | null;
    return { items: (raw ?? []).map((b) => ({ title: b.name ?? "", label: [b.brewery_type, b.city, b.state].filter(Boolean).join(" · ") })) };
  },
});

reg({
  id: "dadjoke", label: "Dad Jokes", category: "fun", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 10_000,
  resources: [{ id: "dadjoke.random", label: "A random joke", shape: "scalar" }],
  async resolve() {
    const raw = (await getJSON("https://icanhazdadjoke.com/", { ...UA, Accept: "application/json" })) as { joke?: string } | null;
    return { value: raw?.joke ?? "" };
  },
});

reg({
  id: "f1", label: "Formula 1", category: "sports", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60_000,
  resources: [{ id: "f1.next", label: "Next race", shape: "list" }],
  async resolve() {
    const raw = (await getJSON("https://api.jolpi.ca/ergast/f1/current/next.json", UA)) as
      { MRData?: { RaceTable?: { Races?: { raceName?: string; date?: string; time?: string; Circuit?: { circuitName?: string; Location?: { locality?: string; country?: string } } }[] } } } | null;
    const race = raw?.MRData?.RaceTable?.Races?.[0];
    if (!race) return { items: [], value: "" };
    const loc = race.Circuit?.Location;
    return {
      value: race.raceName ?? "",
      items: [
        { text: "Race", value: race.raceName ?? "" },
        { text: "Date", value: [race.date, race.time].filter(Boolean).join(" ") },
        { text: "Circuit", value: race.Circuit?.circuitName ?? "" },
        { text: "Where", value: [loc?.locality, loc?.country].filter(Boolean).join(", ") },
      ],
    };
  },
});

reg({
  id: "uselessfacts", label: "Random Facts", category: "fun", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 10_000,
  resources: [{ id: "uselessfacts.random", label: "A random fact", shape: "scalar" }],
  async resolve() {
    const raw = (await getJSON("https://uselessfacts.jsph.pl/api/v2/facts/random", UA)) as { text?: string } | null;
    return { value: raw?.text ?? "" };
  },
});

// ---- E3: more keyless public-data providers (weather/science/place/media/gaming) ----

reg({
  id: "nws", label: "US Weather Alerts", category: "weather", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 60_000,
  resources: [{ id: "nws.alerts", label: "Active alerts", shape: "list" }],
  async resolve(ctx) {
    const area = ((ctx.query.area || "CA").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2)) || "CA";
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://api.weather.gov/alerts/active?area=${area}`, UA)) as
      { features?: { properties?: { event?: string; severity?: string; areaDesc?: string } }[] } | null;
    return { items: (raw?.features ?? []).slice(0, max).map((f) => ({ title: f.properties?.event ?? "", label: [f.properties?.severity, f.properties?.areaDesc].filter(Boolean).join(" · ").slice(0, 80) })) };
  },
});

reg({
  id: "eonet", label: "Natural Events (NASA)", category: "science", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 60_000,
  resources: [{ id: "eonet.events", label: "Open natural events", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=${max}`, UA)) as
      { events?: { title?: string; categories?: { title?: string }[] }[] } | null;
    return { items: (raw?.events ?? []).map((e) => ({ title: e.title ?? "", label: e.categories?.[0]?.title ?? "" })) };
  },
});

reg({
  id: "sunrise", label: "Sunrise / Sunset", category: "place", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 60_000,
  resources: [{ id: "sunrise.times", label: "Sun times", shape: "list" }],
  async resolve(ctx) {
    const lat = Number(ctx.query.lat) || 51.5;
    const lng = Number(ctx.query.lng) || -0.12;
    const raw = (await getJSON(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0`, UA)) as
      { results?: { sunrise?: string; sunset?: string; day_length?: number; solar_noon?: string } } | null;
    const r = raw?.results;
    const hm = (iso?: string) => (iso ? new Date(iso).toISOString().slice(11, 16) : "");
    return { items: [
      { text: "Sunrise (UTC)", value: hm(r?.sunrise) },
      { text: "Sunset (UTC)", value: hm(r?.sunset) },
      { text: "Solar noon (UTC)", value: hm(r?.solar_noon) },
      { text: "Day length (h)", value: r?.day_length ? Number((r.day_length / 3600).toFixed(1)) : 0 },
    ] };
  },
});

reg({
  id: "zippopotam", label: "Postal Code Lookup", category: "place", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 30_000,
  resources: [{ id: "zippopotam.place", label: "Place for a postcode", shape: "list" }],
  async resolve(ctx) {
    const country = (ctx.query.country || "us").toLowerCase().replace(/[^a-z]/g, "").slice(0, 2) || "us";
    const code = (ctx.query.code || "10001").trim().replace(/[^A-Za-z0-9 -]/g, "");
    const raw = (await getJSON(`https://api.zippopotam.us/${country}/${encodeURIComponent(code)}`, UA)) as
      { places?: { "place name"?: string; state?: string }[] } | null;
    return { items: (raw?.places ?? []).map((p) => ({ title: p["place name"] ?? "", label: p.state ?? "" })) };
  },
});

reg({
  id: "itunes", label: "Apple iTunes Search", category: "media", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 15_000,
  resources: [{ id: "itunes.search", label: "Music / podcasts / apps", shape: "list" }],
  async resolve(ctx) {
    const term = (ctx.query.q || "daft punk").trim();
    const entity = ["song", "podcast", "movie", "ebook", "software", "album"].includes(ctx.query.entity || "") ? ctx.query.entity : "song";
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=${max}`, UA)) as
      { results?: { trackName?: string; collectionName?: string; artistName?: string }[] } | null;
    return { items: (raw?.results ?? []).map((r) => ({ title: r.trackName || r.collectionName || "", label: r.artistName ?? "" })) };
  },
});

reg({
  id: "deezer", label: "Deezer", category: "media", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 15_000,
  resources: [{ id: "deezer.search", label: "Track search", shape: "list" }],
  async resolve(ctx) {
    const q = (ctx.query.q || "lofi").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${max}`, UA)) as
      { data?: { title?: string; artist?: { name?: string }; album?: { title?: string } }[] } | null;
    return { items: (raw?.data ?? []).map((t) => ({ title: t.title ?? "", label: t.artist?.name ?? "" })) };
  },
});

reg({
  id: "musicbrainz", label: "MusicBrainz", category: "media", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 30_000,
  resources: [{ id: "musicbrainz.artists", label: "Artist search", shape: "list" }],
  async resolve(ctx) {
    const q = (ctx.query.q || "").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(q)}&fmt=json&limit=${max}`, UA)) as
      { artists?: { name?: string; disambiguation?: string; country?: string }[] } | null;
    return { items: (raw?.artists ?? []).map((a) => ({ title: a.name ?? "", label: a.disambiguation || a.country || "" })) };
  },
});

reg({
  id: "pokeapi", label: "PokéAPI", category: "gaming", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 30_000,
  resources: [{ id: "pokeapi.list", label: "Pokémon list", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 20, 60);
    const raw = (await getJSON(`https://pokeapi.co/api/v2/pokemon?limit=${max}`, UA)) as
      { results?: { name?: string }[] } | null;
    return { items: (raw?.results ?? []).map((p) => ({ title: p.name ? p.name.charAt(0).toUpperCase() + p.name.slice(1) : "" })) };
  },
});

reg({
  id: "scryfall", label: "Scryfall (MTG)", category: "gaming", authKind: "none",
  defaultTtlMs: TTL.h12, minRefreshMs: 30_000,
  resources: [{ id: "scryfall.search", label: "Card search", shape: "list" }],
  async resolve(ctx) {
    const q = (ctx.query.q || "t:goblin").trim();
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`, { ...UA, Accept: "application/json" })) as
      { data?: { name?: string; type_line?: string; set_name?: string }[] } | null;
    return { items: (raw?.data ?? []).slice(0, max).map((c) => ({ title: c.name ?? "", label: c.type_line || c.set_name || "" })) };
  },
});

reg({
  id: "opendota", label: "Dota 2 (OpenDota)", category: "gaming", authKind: "none",
  defaultTtlMs: TTL.h6, minRefreshMs: 60_000,
  resources: [{ id: "opendota.heroes", label: "Top pro heroes", shape: "list" }],
  async resolve(ctx) {
    const max = Math.min(Number(ctx.query.max) || 10, 25);
    const raw = (await getJSON("https://api.opendota.com/api/heroStats", UA)) as
      { localized_name?: string; pro_pick?: number; pro_win?: number }[] | null;
    const top = (raw ?? []).slice().sort((a, b) => (b.pro_pick ?? 0) - (a.pro_pick ?? 0)).slice(0, max);
    return { items: top.map((h) => ({ text: h.localized_name ?? "", value: Number(h.pro_pick ?? 0) })) };
  },
});

reg({
  id: "catfact", label: "Cat Facts", category: "fun", authKind: "none",
  defaultTtlMs: TTL.h1, minRefreshMs: 10_000,
  resources: [{ id: "catfact.random", label: "A cat fact", shape: "scalar" }],
  async resolve() {
    const raw = (await getJSON("https://catfact.ninja/fact", UA)) as { fact?: string } | null;
    return { value: raw?.fact ?? "" };
  },
});

reg({
  id: "chucknorris", label: "Chuck Norris Jokes", category: "fun", authKind: "none",
  defaultTtlMs: TTL.m10, minRefreshMs: 10_000,
  resources: [{ id: "chucknorris.random", label: "A random joke", shape: "scalar" }],
  async resolve() {
    const raw = (await getJSON("https://api.chucknorris.io/jokes/random", UA)) as { value?: string } | null;
    return { value: raw?.value ?? "" };
  },
});
