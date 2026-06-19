import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import { getOAuthAppCreds } from "./oauth-apps";
import { PROVIDERS, type OAuthSpec } from "./providers/registry";
import { hmacSign, hmacVerify, open, seal } from "./secrets";

// OAuth2 authorization-code + PKCE + refresh, generic over any provider that
// declares an OAuthSpec. The self-hoster supplies the client id/secret in
// oauth_apps (the agent can't register apps). Pure helpers (pkce/state/exchange)
// are exported so they're unit-tested offline with an injected fetch.

export type FetchImpl = typeof fetch;
export class NoOAuthApp extends Error {}

// ---- PKCE ----
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ---- signed state (integrity + expiry; carries no secret) ----
export function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacSign(body)}`;
}
export function verifyState(token: string): Record<string, unknown> | null {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!hmacVerify(body, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// In-memory PKCE verifier store, keyed by a per-flow sid embedded in the signed
// state. Short-lived; lost on restart → the user simply retries the connect.
const pending = new Map<string, { verifier: string; exp: number }>();
function rememberVerifier(sid: string, verifier: string): void {
  const now = Date.now();
  for (const [k, v] of pending) if (v.exp < now) pending.delete(k); // opportunistic GC
  pending.set(sid, { verifier, exp: now + 10 * 60_000 });
}
function takeVerifier(sid: string): string | null {
  const e = pending.get(sid);
  if (!e) return null;
  pending.delete(sid);
  return e.exp < Date.now() ? null : e.verifier;
}

/** Build the provider's authorize URL to start the flow; throws NoOAuthApp if
 *  the self-hoster hasn't registered a client id/secret for this provider. */
export function buildAuthorizeUrl(userId: string, providerId: string, redirectUri: string): string {
  const provider = PROVIDERS.get(providerId);
  if (!provider?.oauth) throw new Error("not an oauth provider");
  const creds = getOAuthAppCreds(userId, providerId);
  if (!creds) throw new NoOAuthApp();
  const { verifier, challenge } = pkcePair();
  const sid = randomUUID();
  rememberVerifier(sid, verifier);
  const state = signState({ sid, userId, provider: providerId, exp: Date.now() + 10 * 60_000 });
  const u = new URL(provider.oauth.authorizeUrl);
  u.searchParams.set("client_id", creds.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", provider.oauth.scopes.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(provider.oauth.authParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

interface TokenResp { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string }

async function postForm(spec: OAuthSpec, params: Record<string, string>, f: FetchImpl): Promise<TokenResp> {
  const res = await f(spec.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params),
  });
  return (await res.json()) as TokenResp;
}

export function exchangeCode(spec: OAuthSpec, creds: { clientId: string; clientSecret: string }, code: string, verifier: string, redirectUri: string, f: FetchImpl = fetch): Promise<TokenResp> {
  return postForm(spec, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, client_id: creds.clientId, client_secret: creds.clientSecret }, f);
}
export function refreshAccessToken(spec: OAuthSpec, creds: { clientId: string; clientSecret: string }, refreshToken: string, f: FetchImpl = fetch): Promise<TokenResp> {
  return postForm(spec, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret }, f);
}

export interface OAuthTokens { access: string; refresh: string | null; expiresAt: number; scope?: string }
export function tokensFromResp(r: TokenResp, prevRefresh?: string | null): OAuthTokens | null {
  if (!r.access_token) return null;
  return {
    access: r.access_token,
    refresh: r.refresh_token ?? prevRefresh ?? null,
    expiresAt: Date.now() + (r.expires_in ? r.expires_in * 1000 : 3600_000),
    scope: r.scope,
  };
}

/** Persist (create or update) the per-user connection for an oauth provider and
 *  seal its tokens. Returns the connection id. */
export function saveOAuthConnection(userId: string, providerId: string, tokens: OAuthTokens): string {
  const provider = PROVIDERS.get(providerId)!;
  const existing = db.prepare("SELECT id FROM connections WHERE user_id = ? AND provider = ? LIMIT 1").get(userId, providerId) as { id: string } | undefined;
  const now = Date.now();
  const id = existing?.id ?? randomUUID();
  if (existing) {
    db.prepare("UPDATE connections SET status = 'ok', last_error = '', updated_at = ? WHERE id = ?").run(now, id);
  } else {
    db.prepare("INSERT INTO connections (id, user_id, provider, label, auth_kind, config, status, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, 'oauth2', '{}', 'ok', '', ?, ?)")
      .run(id, userId, providerId, provider.label, now, now);
  }
  db.prepare("INSERT INTO connection_secrets (connection_id, kind, key_version, cipher, updated_at) VALUES (?, 'oauth', 1, ?, ?) ON CONFLICT(connection_id, kind) DO UPDATE SET cipher = excluded.cipher, updated_at = excluded.updated_at")
    .run(id, seal(JSON.stringify(tokens)), now);
  return id;
}

/** Finish the redirect callback: verify state → exchange code → persist. */
export async function completeOAuth(userId: string, providerId: string, code: string, state: string, redirectUri: string, f: FetchImpl = fetch): Promise<{ ok: boolean; error?: string }> {
  const provider = PROVIDERS.get(providerId);
  if (!provider?.oauth) return { ok: false, error: "unknown_provider" };
  const payload = verifyState(state);
  if (!payload || payload.userId !== userId || payload.provider !== providerId || typeof payload.sid !== "string") return { ok: false, error: "bad_state" };
  const verifier = takeVerifier(payload.sid);
  if (!verifier) return { ok: false, error: "expired" };
  const creds = getOAuthAppCreds(userId, providerId);
  if (!creds) return { ok: false, error: "no_app" };
  const resp = await exchangeCode(provider.oauth, creds, code, verifier, redirectUri, f);
  const tokens = tokensFromResp(resp);
  if (!tokens) return { ok: false, error: resp.error || "exchange_failed" };
  saveOAuthConnection(userId, providerId, tokens);
  return { ok: true };
}

function markNeedsAuth(connectionId: string): void {
  db.prepare("UPDATE connections SET status = 'needs_auth' WHERE id = ?").run(connectionId);
}

// Dedup concurrent refreshes of the same connection (N blocks → one refresh).
const refreshing = new Map<string, Promise<string | null>>();

/** Return a valid access token for an oauth connection, transparently
 *  refreshing it if it's within 60s of expiry. null → needs reconnect. */
export async function ensureFreshOAuthToken(connectionId: string, userId: string, providerId: string, f: FetchImpl = fetch): Promise<string | null> {
  const row = db.prepare("SELECT cipher FROM connection_secrets WHERE connection_id = ? AND kind = 'oauth'").get(connectionId) as { cipher: Buffer } | undefined;
  const json = row ? open(row.cipher) : null;
  if (!json) { markNeedsAuth(connectionId); return null; }
  let tokens: OAuthTokens;
  try { tokens = JSON.parse(json) as OAuthTokens; } catch { markNeedsAuth(connectionId); return null; }
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.access; // still valid
  if (!tokens.refresh) { markNeedsAuth(connectionId); return null; }

  const inflight = refreshing.get(connectionId);
  if (inflight) return inflight;
  const p = (async (): Promise<string | null> => {
    const provider = PROVIDERS.get(providerId);
    const creds = getOAuthAppCreds(userId, providerId);
    if (!provider?.oauth || !creds) { markNeedsAuth(connectionId); return null; }
    const resp = await refreshAccessToken(provider.oauth, creds, tokens.refresh!, f);
    const next = tokensFromResp(resp, tokens.refresh);
    if (!next) { markNeedsAuth(connectionId); return null; }
    db.prepare("UPDATE connection_secrets SET cipher = ?, updated_at = ? WHERE connection_id = ? AND kind = 'oauth'").run(seal(JSON.stringify(next)), Date.now(), connectionId);
    db.prepare("UPDATE connections SET status = 'ok', last_error = '' WHERE id = ?").run(connectionId);
    return next.access;
  })().finally(() => refreshing.delete(connectionId));
  refreshing.set(connectionId, p);
  return p;
}
