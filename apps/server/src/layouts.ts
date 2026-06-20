import { randomBytes } from "node:crypto";
import { Layout, parseDocument, type LayoutT } from "@glanceos/schema";
import { hashPassword, verifyHash } from "./auth";
import { db } from "./db";

// Setups (user layouts) AND the template hub live here. Builtins are rows with
// is_template = 1 and user_id NULL — published, authored by "GlanceOS",
// unownable, therefore never editable or deletable through the API.
// (src/hub.ts is the SSE hub; the template hub is plain layout queries.)

export interface LayoutRecord {
  id: number;
  name: string;
  version: number;
  document: LayoutT;
  isTemplate: boolean;
  userId: string | null;
  published: boolean;
  description: string;
  importCount: number;
}

export interface SetupSummary extends LayoutRecord {
  usedBy: number;
  deviceNames: string[];
}

export interface HubItem {
  id: number;
  name: string;
  description: string;
  author: string;
  importCount: number;
  document: LayoutT;
}

interface LayoutRow {
  id: number;
  name: string;
  version: number;
  document: string;
  is_template: number;
  user_id: string | null;
  published: number;
  description: string;
  import_count: number;
}

function toRecord(row: LayoutRow): LayoutRecord {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    // Parse on the way out — v1 grid documents migrate to v2 document-flow
    // here, transparently, and schema drift surfaces here, not on a screen.
    document: parseDocument(JSON.parse(row.document)),
    isTemplate: row.is_template === 1,
    userId: row.user_id,
    published: row.published === 1,
    description: row.description,
    importCount: row.import_count,
  };
}

export function getLayout(id: number): LayoutRecord | undefined {
  const row = db.prepare("SELECT * FROM layouts WHERE id = ?").get(id) as LayoutRow | undefined;
  return row ? toRecord(row) : undefined;
}

export function getOwnedLayout(id: number, userId: string): LayoutRecord | undefined {
  const layout = getLayout(id);
  return layout && layout.userId === userId ? layout : undefined;
}

// ---- public read-only share links (optional expiry + password) ----

export interface ShareInfo { token: string; expiresAt: number | null; hasPassword: boolean }

/** Current share token for an owned layout (null if not shared). */
export function getShareToken(id: number, userId: string): string | null {
  const row = db.prepare("SELECT share_token FROM layouts WHERE id = ? AND user_id = ?").get(id, userId) as { share_token: string | null } | undefined;
  return row?.share_token ?? null;
}

/** Share status for the owner UI (null if not shared). */
export function getShareInfo(id: number, userId: string): ShareInfo | null {
  const row = db.prepare("SELECT share_token, share_expires_at, share_pw_hash FROM layouts WHERE id = ? AND user_id = ?")
    .get(id, userId) as { share_token: string | null; share_expires_at: number | null; share_pw_hash: string | null } | undefined;
  if (!row?.share_token) return null;
  return { token: row.share_token, expiresAt: row.share_expires_at, hasPassword: !!row.share_pw_hash };
}

/** Enable/update sharing. Mints a token if none; sets expiry/password when given
 *  (expiresAt/password === null clears that field). Idempotent on the token. */
export function setShareToken(id: number, userId: string, opts: { expiresAt?: number | null; password?: string | null } = {}): ShareInfo | null {
  if (!getOwnedLayout(id, userId)) return null;
  const token = getShareToken(id, userId) ?? randomBytes(18).toString("base64url");
  const sets = ["share_token = ?"];
  const vals: unknown[] = [token];
  if (opts.expiresAt !== undefined) { sets.push("share_expires_at = ?"); vals.push(opts.expiresAt); }
  if (opts.password !== undefined) { sets.push("share_pw_hash = ?"); vals.push(opts.password ? hashPassword(opts.password) : null); }
  db.prepare(`UPDATE layouts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...vals, id, userId);
  return getShareInfo(id, userId);
}

export function clearShareToken(id: number, userId: string): boolean {
  return db.prepare("UPDATE layouts SET share_token = NULL, share_expires_at = NULL, share_pw_hash = NULL WHERE id = ? AND user_id = ?")
    .run(id, userId).changes > 0;
}

export interface ShareResolve { record: LayoutRecord; ownerId: string | null; expiresAt: number | null; pwHash: string | null }
/** Resolve a public share token → the board + its owner + gate fields (for data resolution). */
export function getLayoutByShareToken(token: string): ShareResolve | undefined {
  const row = db.prepare("SELECT * FROM layouts WHERE share_token = ?").get(token) as
    | (LayoutRow & { share_expires_at: number | null; share_pw_hash: string | null }) | undefined;
  if (!row) return undefined;
  return { record: toRecord(row), ownerId: row.user_id, expiresAt: row.share_expires_at, pwHash: row.share_pw_hash };
}

/** A share is live if it hasn't expired. */
export function shareExpired(expiresAt: number | null): boolean {
  return expiresAt != null && Date.now() > expiresAt;
}
/** Password gate: true when no password is set, or the candidate matches. */
export function verifySharePassword(pwHash: string | null, candidate: string | undefined): boolean {
  if (!pwHash) return true;
  return typeof candidate === "string" && verifyHash(candidate, pwHash);
}

export function listSetups(userId: string): SetupSummary[] {
  const rows = db
    .prepare(
      `SELECT l.*, COUNT(d.id) AS used_by,
              COALESCE(GROUP_CONCAT(d.name, char(31)), '') AS device_names
       FROM layouts l LEFT JOIN devices d ON d.layout_id = l.id
       WHERE l.user_id = ? AND l.is_template = 0
       GROUP BY l.id ORDER BY l.id LIMIT 1000`, // safety cap against a pathological/abusive count
    )
    .all(userId) as Array<LayoutRow & { used_by: number; device_names: string }>;
  return rows.map((row) => ({
    ...toRecord(row),
    usedBy: row.used_by,
    deviceNames: row.device_names ? row.device_names.split("\u001f") : [],
  }));
}

export function blankDocument(name: string): LayoutT {
  return Layout.parse({
    schemaVersion: 3,
    name,
    gap: 2,
    rows: [],
  });
}

export function createLayout(
  name: string,
  document: LayoutT,
  opts: { userId: string | null; isTemplate?: boolean; published?: boolean; description?: string },
): LayoutRecord {
  const result = db
    .prepare(
      `INSERT INTO layouts (name, version, document, is_template, user_id, published, description, import_count, created_at)
       VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      name,
      JSON.stringify(document),
      opts.isTemplate ? 1 : 0,
      opts.userId,
      opts.published ? 1 : 0,
      opts.description ?? "",
      Date.now(),
    );
  return getLayout(Number(result.lastInsertRowid))!;
}

export function duplicateLayout(id: number, userId: string): LayoutRecord | undefined {
  const source = getOwnedLayout(id, userId);
  if (!source) return undefined;
  const name = `${source.name} copy`;
  return createLayout(name, { ...source.document, name }, { userId });
}

export function updateLayout(id: number, document: LayoutT): LayoutRecord | undefined {
  const existing = getLayout(id);
  if (!existing) return undefined;
  db.prepare("UPDATE layouts SET document = ?, name = ?, version = version + 1 WHERE id = ?").run(
    JSON.stringify(document),
    document.name,
    id,
  );
  return getLayout(id);
}

export function updateLayoutMeta(
  id: number,
  patch: { name?: string; description?: string; published?: boolean },
): LayoutRecord | undefined {
  const existing = getLayout(id);
  if (!existing) return undefined;
  const name = patch.name?.trim() || existing.name;
  // Keep the document's name in sync — it's what screens and exports carry.
  const document = { ...existing.document, name };
  db.prepare(
    "UPDATE layouts SET name = ?, document = ?, description = COALESCE(?, description), published = COALESCE(?, published) WHERE id = ?",
  ).run(
    name,
    JSON.stringify(document),
    patch.description ?? null,
    patch.published === undefined ? null : patch.published ? 1 : 0,
    id,
  );
  return getLayout(id);
}

/** Returns the ids of devices that were using the layout (they need a push). */
export function deleteLayout(id: number): string[] {
  const affected = (
    db.prepare("SELECT id FROM devices WHERE layout_id = ?").all(id) as Array<{ id: string }>
  ).map((d) => d.id);
  db.prepare("DELETE FROM layouts WHERE id = ?").run(id); // devices.layout_id → NULL via FK
  return affected;
}

export function listPublished(q?: string): HubItem[] {
  const filter = q ? `%${q}%` : "%";
  const rows = db
    .prepare(
      `SELECT l.*, COALESCE(u.name, 'GlanceOS') AS author
       FROM layouts l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.published = 1 AND (l.name LIKE ? OR l.description LIKE ?)
       ORDER BY l.import_count DESC, l.id`,
    )
    .all(filter, filter) as Array<LayoutRow & { author: string }>;
  return rows.map((row) => {
    const record = toRecord(row);
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      author: row.author,
      importCount: record.importCount,
      document: record.document,
    };
  });
}

export function importFromHub(hubId: number, userId: string): LayoutRecord | undefined {
  const source = getLayout(hubId);
  if (!source || !source.published) return undefined;
  db.prepare("UPDATE layouts SET import_count = import_count + 1 WHERE id = ?").run(hubId);
  return createLayout(source.name, { ...source.document, name: source.name }, { userId });
}
