import { db } from "./db";
import { currentKeyVersion, open, seal } from "./secrets";

// OAuth *app* credentials the self-hoster registers with each provider (the
// agent cannot register apps). One row per (provider, user). The client secret
// is AES-256-GCM sealed and NEVER returned to the client — the summary exposes
// only whether an app exists and the (non-secret) client id.

export interface OAuthAppSummary {
  provider: string;
  clientId: string;
  hasApp: true;
}

interface AppRow { provider: string; user_id: string; client_id: string; client_secret_enc: Buffer }

export function setOAuthApp(userId: string, provider: string, clientId: string, clientSecret: string): void {
  db.prepare(
    "INSERT INTO oauth_apps (provider, user_id, client_id, client_secret_enc, key_version, created_at) VALUES (?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(provider, user_id) DO UPDATE SET client_id = excluded.client_id, client_secret_enc = excluded.client_secret_enc, key_version = excluded.key_version",
  ).run(provider, userId, clientId.trim(), seal(clientSecret), currentKeyVersion(), Date.now());
}

export function deleteOAuthApp(userId: string, provider: string): boolean {
  return db.prepare("DELETE FROM oauth_apps WHERE provider = ? AND user_id = ?").run(provider, userId).changes > 0;
}

/** Public summary for the UI — never includes the secret. */
export function getOAuthAppSummary(userId: string, provider: string): OAuthAppSummary | null {
  const row = db.prepare("SELECT provider, client_id FROM oauth_apps WHERE provider = ? AND user_id = ?").get(provider, userId) as
    | { provider: string; client_id: string } | undefined;
  return row ? { provider: row.provider, clientId: row.client_id, hasApp: true } : null;
}

/** Internal: decrypted client id + secret for the OAuth flow. Never exposed. */
export function getOAuthAppCreds(userId: string, provider: string): { clientId: string; clientSecret: string } | null {
  const row = db.prepare("SELECT * FROM oauth_apps WHERE provider = ? AND user_id = ?").get(provider, userId) as AppRow | undefined;
  if (!row) return null;
  const clientSecret = open(row.client_secret_enc);
  if (clientSecret == null) return null; // lost/rotated key
  return { clientId: row.client_id, clientSecret };
}
