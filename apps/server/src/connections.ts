import { randomUUID } from "node:crypto";
import { db } from "./db";
import { notifyConnectionIssue } from "./notifications";
import { ensureFreshOAuthToken } from "./oauth";
import { PROVIDERS, type AuthKind } from "./providers/registry";
import type { ConnContext, ConnLookup } from "./providers/resolve";
import { currentKeyVersion, open, seal } from "./secrets";

// Per-user integration connections. The ONLY shape that leaves the server is
// ConnectionSummary — *_secrets/cipher are never SELECTed into a response. Every
// query is scoped `WHERE … AND user_id = ?` (cross-user isolation).

interface ConnRow {
  id: string;
  user_id: string; // creator (created_by) — used for OAuth token refresh
  org_id: string | null; // owning org — the access boundary (team-shared)
  provider: string;
  label: string;
  auth_kind: string;
  config: string;
  status: string;
  last_error: string;
  created_at: number;
  updated_at: number;
}

export interface ConnectionSummary {
  id: string;
  provider: string;
  label: string;
  authKind: AuthKind;
  category: string;
  status: string;
  lastError: string;
  config: Record<string, unknown>;
}

function summarize(row: ConnRow): ConnectionSummary {
  const provider = PROVIDERS.get(row.provider);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    authKind: row.auth_kind as AuthKind,
    category: provider?.category ?? "generic",
    status: row.status,
    lastError: row.last_error,
    config: safeJson(row.config),
  };
}

const safeJson = (s: string): Record<string, unknown> => {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
};

export function listConnections(orgId: string): ConnectionSummary[] {
  const rows = db.prepare("SELECT * FROM connections WHERE org_id = ? ORDER BY created_at DESC").all(orgId) as ConnRow[];
  return rows.map(summarize);
}

export function getConnectionSummary(id: string, orgId: string): ConnectionSummary | null {
  const row = db.prepare("SELECT * FROM connections WHERE id = ? AND org_id = ?").get(id, orgId) as ConnRow | undefined;
  return row ? summarize(row) : null;
}

export interface CreateInput {
  provider: string;
  label?: string;
  config?: Record<string, unknown>;
  secret?: string; // token / apiKey / secret URL — sealed, never stored or returned in plaintext
}

export function createConnection(userId: string, orgId: string, input: CreateInput): ConnectionSummary | null {
  const provider = PROVIDERS.get(input.provider);
  if (!provider) return null;
  const id = randomUUID();
  const now = Date.now();
  const needsSecret = provider.authKind === "token" || provider.authKind === "apiKey" || provider.authKind === "url";
  const status = needsSecret && !input.secret ? "needs_auth" : "ok";
  db.prepare(
    "INSERT INTO connections (id, user_id, org_id, provider, label, auth_kind, config, status, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
  ).run(id, userId, orgId, input.provider, input.label?.trim() || provider.label, provider.authKind, JSON.stringify(input.config ?? {}), status, now, now);
  if (input.secret) putSecret(id, "secret", input.secret);
  return getConnectionSummary(id, orgId);
}

export interface UpdateInput {
  label?: string;
  config?: Record<string, unknown>;
  secret?: string;
}

export function updateConnection(id: string, orgId: string, patch: UpdateInput): ConnectionSummary | null {
  const row = db.prepare("SELECT * FROM connections WHERE id = ? AND org_id = ?").get(id, orgId) as ConnRow | undefined;
  if (!row) return null;
  const label = patch.label?.trim() ?? row.label;
  const config = patch.config ? JSON.stringify(patch.config) : row.config;
  let status = row.status;
  if (patch.secret !== undefined) {
    putSecret(id, "secret", patch.secret);
    status = "ok";
  }
  db.prepare("UPDATE connections SET label = ?, config = ?, status = ?, last_error = '', updated_at = ? WHERE id = ?").run(label, config, status, Date.now(), id);
  return getConnectionSummary(id, orgId);
}

export function deleteConnection(id: string, orgId: string): boolean {
  const r = db.prepare("DELETE FROM connections WHERE id = ? AND org_id = ?").run(id, orgId);
  return r.changes > 0; // connection_secrets cascade via FK
}

/** Reflect a resolve outcome on the connection: ok clears the error, auth/error
 *  records it. Called from the resolver path so the Integrations page can badge
 *  needs_auth / rate-limited / error. Best-effort (no-op if the row is gone). */
export function markConnStatus(id: string, status: "ok" | "needs_auth" | "error", lastError = ""): void {
  const prev = db.prepare("SELECT user_id, label, status FROM connections WHERE id = ?").get(id) as { user_id: string; label: string; status: string } | undefined;
  db.prepare("UPDATE connections SET status = ?, last_error = ?, updated_at = ? WHERE id = ?").run(status, lastError, Date.now(), id);
  // Surface a freshly-unhealthy integration in the bell (once per state per day).
  if (prev && prev.status !== status && (status === "error" || status === "needs_auth")) {
    notifyConnectionIssue(prev.user_id, prev.label, status);
  }
}

function putSecret(connectionId: string, kind: string, plain: string): void {
  db.prepare(
    "INSERT INTO connection_secrets (connection_id, kind, key_version, cipher, updated_at) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(connection_id, kind) DO UPDATE SET cipher = excluded.cipher, key_version = excluded.key_version, updated_at = excluded.updated_at",
  ).run(connectionId, kind, currentKeyVersion(), seal(plain), Date.now());
}

function readSecret(connectionId: string, kind: string): string | null {
  const row = db.prepare("SELECT cipher FROM connection_secrets WHERE connection_id = ? AND kind = ?").get(connectionId, kind) as { cipher: Buffer } | undefined;
  return row ? open(row.cipher) : null;
}

/** Internal resolver hook: decrypt a connection's secret + config for the data
 *  resolver. Never exposed over the API. Flips status to needs_auth if a secret
 *  was expected but can't be decrypted (lost/rotated key). */
export function connLookupForOrg(orgId: string): ConnLookup {
  return async (connectionId: string): Promise<ConnContext | null> => {
    const row = db.prepare("SELECT * FROM connections WHERE id = ? AND org_id = ?").get(connectionId, orgId) as ConnRow | undefined;
    if (!row) return null;
    if (row.auth_kind === "oauth2") {
      // access token, transparently refreshed if expired; null → needs reconnect.
      // OAuth apps/tokens are keyed by the connection's creator, so refresh under them.
      const access = await ensureFreshOAuthToken(connectionId, row.user_id, row.provider);
      return { secret: access, config: safeJson(row.config) };
    }
    const secret = readSecret(connectionId, "secret");
    if (!secret && (row.auth_kind === "token" || row.auth_kind === "apiKey" || row.auth_kind === "url")) {
      db.prepare("UPDATE connections SET status = 'needs_auth' WHERE id = ?").run(connectionId);
    }
    return { secret, config: safeJson(row.config) };
  };
}
