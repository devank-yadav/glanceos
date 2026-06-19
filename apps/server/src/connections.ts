import { randomUUID } from "node:crypto";
import { db } from "./db";
import { ensureFreshOAuthToken } from "./oauth";
import { PROVIDERS, type AuthKind } from "./providers/registry";
import type { ConnContext, ConnLookup } from "./providers/resolve";
import { open, seal } from "./secrets";

// Per-user integration connections. The ONLY shape that leaves the server is
// ConnectionSummary — *_secrets/cipher are never SELECTed into a response. Every
// query is scoped `WHERE … AND user_id = ?` (cross-user isolation).

interface ConnRow {
  id: string;
  user_id: string;
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

export function listConnections(userId: string): ConnectionSummary[] {
  const rows = db.prepare("SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC").all(userId) as ConnRow[];
  return rows.map(summarize);
}

export function getConnectionSummary(id: string, userId: string): ConnectionSummary | null {
  const row = db.prepare("SELECT * FROM connections WHERE id = ? AND user_id = ?").get(id, userId) as ConnRow | undefined;
  return row ? summarize(row) : null;
}

export interface CreateInput {
  provider: string;
  label?: string;
  config?: Record<string, unknown>;
  secret?: string; // token / apiKey / secret URL — sealed, never stored or returned in plaintext
}

export function createConnection(userId: string, input: CreateInput): ConnectionSummary | null {
  const provider = PROVIDERS.get(input.provider);
  if (!provider) return null;
  const id = randomUUID();
  const now = Date.now();
  const needsSecret = provider.authKind === "token" || provider.authKind === "apiKey" || provider.authKind === "url";
  const status = needsSecret && !input.secret ? "needs_auth" : "ok";
  db.prepare(
    "INSERT INTO connections (id, user_id, provider, label, auth_kind, config, status, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
  ).run(id, userId, input.provider, input.label?.trim() || provider.label, provider.authKind, JSON.stringify(input.config ?? {}), status, now, now);
  if (input.secret) putSecret(id, "secret", input.secret);
  return getConnectionSummary(id, userId);
}

export interface UpdateInput {
  label?: string;
  config?: Record<string, unknown>;
  secret?: string;
}

export function updateConnection(id: string, userId: string, patch: UpdateInput): ConnectionSummary | null {
  const row = db.prepare("SELECT * FROM connections WHERE id = ? AND user_id = ?").get(id, userId) as ConnRow | undefined;
  if (!row) return null;
  const label = patch.label?.trim() ?? row.label;
  const config = patch.config ? JSON.stringify(patch.config) : row.config;
  let status = row.status;
  if (patch.secret !== undefined) {
    putSecret(id, "secret", patch.secret);
    status = "ok";
  }
  db.prepare("UPDATE connections SET label = ?, config = ?, status = ?, last_error = '', updated_at = ? WHERE id = ?").run(label, config, status, Date.now(), id);
  return getConnectionSummary(id, userId);
}

export function deleteConnection(id: string, userId: string): boolean {
  const r = db.prepare("DELETE FROM connections WHERE id = ? AND user_id = ?").run(id, userId);
  return r.changes > 0; // connection_secrets cascade via FK
}

function putSecret(connectionId: string, kind: string, plain: string): void {
  db.prepare(
    "INSERT INTO connection_secrets (connection_id, kind, key_version, cipher, updated_at) VALUES (?, ?, 1, ?, ?) " +
    "ON CONFLICT(connection_id, kind) DO UPDATE SET cipher = excluded.cipher, key_version = 1, updated_at = excluded.updated_at",
  ).run(connectionId, kind, seal(plain), Date.now());
}

function readSecret(connectionId: string, kind: string): string | null {
  const row = db.prepare("SELECT cipher FROM connection_secrets WHERE connection_id = ? AND kind = ?").get(connectionId, kind) as { cipher: Buffer } | undefined;
  return row ? open(row.cipher) : null;
}

/** Internal resolver hook: decrypt a connection's secret + config for the data
 *  resolver. Never exposed over the API. Flips status to needs_auth if a secret
 *  was expected but can't be decrypted (lost/rotated key). */
export function connLookupFor(userId: string): ConnLookup {
  return async (connectionId: string): Promise<ConnContext | null> => {
    const row = db.prepare("SELECT * FROM connections WHERE id = ? AND user_id = ?").get(connectionId, userId) as ConnRow | undefined;
    if (!row) return null;
    if (row.auth_kind === "oauth2") {
      // access token, transparently refreshed if expired; null → needs reconnect
      const access = await ensureFreshOAuthToken(connectionId, userId, row.provider);
      return { secret: access, config: safeJson(row.config) };
    }
    const secret = readSecret(connectionId, "secret");
    if (!secret && (row.auth_kind === "token" || row.auth_kind === "apiKey" || row.auth_kind === "url")) {
      db.prepare("UPDATE connections SET status = 'needs_auth' WHERE id = ?").run(connectionId);
    }
    return { secret, config: safeJson(row.config) };
  };
}
