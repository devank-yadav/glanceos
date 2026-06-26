import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";

// Scoped API keys. The token (gos_<base64url(32)>) is shown ONCE at mint; we keep
// only its sha256, so a single indexed lookup authenticates each request (a fast
// hash is correct here — the token is high-entropy random, unlike a password).

export const SCOPES = ["tasks:read", "tasks:write", "queues:write", "devices:read", "layouts:read", "data:write"] as const;
export type Scope = (typeof SCOPES)[number];
export const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

interface KeyRow { id: string; user_id: string; org_id: string | null; name: string; token_hash: string; prefix: string; scopes: string; created_at: number; last_used: number | null }

export interface KeySummary { id: string; name: string; prefix: string; scopes: Scope[]; createdAt: number; lastUsed: number | null }

const toSummary = (r: KeyRow): KeySummary => ({
  id: r.id, name: r.name, prefix: r.prefix, scopes: JSON.parse(r.scopes) as Scope[], createdAt: r.created_at, lastUsed: r.last_used,
});

/** Mint a key bound to (userId as creator, orgId for data scope). Returns the plaintext
 *  token ONCE (never recoverable) + a summary. */
export function mintKey(userId: string, orgId: string, name: string, scopes: Scope[]): { token: string; key: KeySummary } {
  const token = `gos_${randomBytes(32).toString("base64url")}`;
  const id = randomUUID();
  const prefix = token.slice(0, 12);
  db.prepare("INSERT INTO api_keys (id, user_id, org_id, name, token_hash, prefix, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, orgId, name.trim().slice(0, 80) || "API key", sha256(token), prefix, JSON.stringify([...new Set(scopes)]), Date.now());
  return { token, key: toSummary(db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as KeyRow) };
}

export function listKeys(userId: string): KeySummary[] {
  return (db.prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC").all(userId) as KeyRow[]).map(toSummary);
}

export function revokeKey(id: string, userId: string): boolean {
  return db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

// last_used is bumped at most once a minute to avoid a write per request.
const lastBump = new Map<string, number>();

/** Authenticate a Bearer token → its owner + org + scopes, or null. */
export function resolveKey(token: string, now = Date.now()): { userId: string; orgId: string | null; scopes: Scope[] } | null {
  if (!token.startsWith("gos_")) return null;
  const row = db.prepare("SELECT * FROM api_keys WHERE token_hash = ?").get(sha256(token)) as KeyRow | undefined;
  if (!row) return null;
  if ((now - (lastBump.get(row.id) ?? 0)) > 60_000) {
    lastBump.set(row.id, now);
    db.prepare("UPDATE api_keys SET last_used = ? WHERE id = ?").run(now, row.id);
  }
  return { userId: row.user_id, orgId: row.org_id, scopes: JSON.parse(row.scopes) as Scope[] };
}
