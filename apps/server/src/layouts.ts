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
  userId: string | null; // creator (created_by); kept for authorship + back-compat
  orgId: string | null; // owning org — the access boundary (null for global templates)
  published: boolean;
  description: string;
  importCount: number;
  reviewStatus: string; // 'pending' | 'approved' — only meaningful when published
  folder: string | null; // #104 — organize boards into collections (null = Unfiled)
  archived: boolean; // #107 — soft-deleted: hidden from the main list/pickers but restorable
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
  reviewStatus?: string;
}

interface LayoutRow {
  id: number;
  name: string;
  version: number;
  document: string;
  is_template: number;
  user_id: string | null;
  org_id: string | null;
  published: number;
  description: string;
  import_count: number;
  review_status: string;
  folder: string | null;
  archived_at: number | null;
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
    orgId: row.org_id ?? null,
    published: row.published === 1,
    description: row.description,
    importCount: row.import_count,
    reviewStatus: row.review_status ?? "approved",
    folder: row.folder ?? null,
    archived: !!row.archived_at,
  };
}

export function getLayout(id: number): LayoutRecord | undefined {
  const row = db.prepare("SELECT * FROM layouts WHERE id = ?").get(id) as LayoutRow | undefined;
  return row ? toRecord(row) : undefined;
}

/** A board owned by this ORG (the access boundary). Global templates (orgId null)
 *  are never "owned" — they're imported, not edited. */
export function getOwnedLayout(id: number, orgId: string): LayoutRecord | undefined {
  const layout = getLayout(id);
  return layout && layout.orgId === orgId ? layout : undefined;
}

// ---- public read-only share links (optional expiry + password) ----

export interface ShareInfo { token: string; expiresAt: number | null; hasPassword: boolean }

/** Current share token for an org-owned layout (null if not shared). */
export function getShareToken(id: number, orgId: string): string | null {
  const row = db.prepare("SELECT share_token FROM layouts WHERE id = ? AND org_id = ?").get(id, orgId) as { share_token: string | null } | undefined;
  return row?.share_token ?? null;
}

/** Share status for the owner UI (null if not shared). */
export function getShareInfo(id: number, orgId: string): ShareInfo | null {
  const row = db.prepare("SELECT share_token, share_expires_at, share_pw_hash FROM layouts WHERE id = ? AND org_id = ?")
    .get(id, orgId) as { share_token: string | null; share_expires_at: number | null; share_pw_hash: string | null } | undefined;
  if (!row?.share_token) return null;
  return { token: row.share_token, expiresAt: row.share_expires_at, hasPassword: !!row.share_pw_hash };
}

/** Enable/update sharing. Mints a token if none; sets expiry/password when given
 *  (expiresAt/password === null clears that field). Idempotent on the token. */
export function setShareToken(id: number, orgId: string, opts: { expiresAt?: number | null; password?: string | null } = {}): ShareInfo | null {
  if (!getOwnedLayout(id, orgId)) return null;
  const token = getShareToken(id, orgId) ?? randomBytes(18).toString("base64url");
  const sets = ["share_token = ?"];
  const vals: unknown[] = [token];
  if (opts.expiresAt !== undefined) { sets.push("share_expires_at = ?"); vals.push(opts.expiresAt); }
  if (opts.password !== undefined) { sets.push("share_pw_hash = ?"); vals.push(opts.password ? hashPassword(opts.password) : null); }
  db.prepare(`UPDATE layouts SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`).run(...vals, id, orgId);
  return getShareInfo(id, orgId);
}

export function clearShareToken(id: number, orgId: string): boolean {
  return db.prepare("UPDATE layouts SET share_token = NULL, share_expires_at = NULL, share_pw_hash = NULL WHERE id = ? AND org_id = ?")
    .run(id, orgId).changes > 0;
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

export function listSetups(orgId: string, opts: { archived?: boolean } = {}): SetupSummary[] {
  // #107 — the main list shows only active boards; pass { archived: true } for the archive view.
  const archiveClause = opts.archived ? "AND l.archived_at IS NOT NULL" : "AND l.archived_at IS NULL";
  const rows = db
    .prepare(
      `SELECT l.*, COUNT(d.id) AS used_by,
              COALESCE(GROUP_CONCAT(d.name, char(31)), '') AS device_names
       FROM layouts l LEFT JOIN devices d ON d.layout_id = l.id
       WHERE l.org_id = ? AND l.is_template = 0 ${archiveClause}
       GROUP BY l.id ORDER BY l.id LIMIT 1000`, // safety cap against a pathological/abusive count
    )
    .all(orgId) as Array<LayoutRow & { used_by: number; device_names: string }>;
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
  opts: { userId: string | null; orgId?: string | null; isTemplate?: boolean; published?: boolean; description?: string },
): LayoutRecord {
  const result = db
    .prepare(
      `INSERT INTO layouts (name, version, document, is_template, user_id, org_id, published, description, import_count, created_at, review_status)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      name,
      JSON.stringify(document),
      opts.isTemplate ? 1 : 0,
      opts.userId,
      opts.orgId ?? null, // global templates (seed) have no org
      opts.published ? 1 : 0,
      opts.description ?? "",
      Date.now(),
      // Published-at-creation = trusted builtins (seed) → live in the gallery immediately.
      opts.published ? "approved" : "pending",
    );
  return getLayout(Number(result.lastInsertRowid))!;
}

export function duplicateLayout(id: number, orgId: string, userId: string): LayoutRecord | undefined {
  const source = getOwnedLayout(id, orgId);
  if (!source) return undefined;
  const name = `${source.name} copy`;
  return createLayout(name, { ...source.document, name }, { userId, orgId });
}

// ---- board version history (archive prior states; restore later) ----

const VERSION_KEEP = (() => { const n = Number(process.env.GLANCEOS_VERSION_KEEP); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50; })();
// Throttle: only archive if the newest version is older than this, so frequent
// autosaves don't flood history. 0 in tests captures every save.
const VERSION_MIN_INTERVAL_MS = (() => { const n = Number(process.env.GLANCEOS_VERSION_MIN_INTERVAL_MS); return Number.isFinite(n) && n >= 0 ? n : 5 * 60_000; })();

export interface LayoutVersionMeta { id: number; summary: string; createdAt: number; label: string | null }

/** Archive a board's CURRENT document as a version (throttled + pruned). Called
 *  by updateLayout before it overwrites, so each version is a restorable past state. */
export function snapshotLayout(id: number, now = Date.now()): void {
  const row = db.prepare("SELECT document, user_id, name FROM layouts WHERE id = ?").get(id) as
    { document: string; user_id: string | null; name: string } | undefined;
  if (!row) return;
  const last = db.prepare("SELECT created_at FROM layout_versions WHERE layout_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as { created_at: number } | undefined;
  if (last && now - last.created_at < VERSION_MIN_INTERVAL_MS) return; // throttled
  db.prepare("INSERT INTO layout_versions (layout_id, user_id, document, summary, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, row.user_id, row.document, row.name, now);
  db.prepare(
    // #95 — never prune a LABELED (named) version: a named restore point is permanent.
    `DELETE FROM layout_versions WHERE layout_id = ? AND label IS NULL AND id NOT IN (
       SELECT id FROM layout_versions WHERE layout_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`,
  ).run(id, id, VERSION_KEEP);
}

/** Versions for an owned board, newest first. */
export function listLayoutVersions(layoutId: number, orgId: string, limit = 50): LayoutVersionMeta[] {
  if (!getOwnedLayout(layoutId, orgId)) return [];
  const rows = db.prepare(
    "SELECT id, summary, created_at, label FROM layout_versions WHERE layout_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
  ).all(layoutId, Math.min(Math.max(1, limit), 100)) as { id: number; summary: string; created_at: number; label: string | null }[];
  return rows.map((r) => ({ id: r.id, summary: r.summary, createdAt: r.created_at, label: r.label ?? null }));
}

/** #95 — name (or clear, with null/"") a board version. A labeled version is protected from
 *  the auto-prune, so it becomes a permanent restore point. Returns false if the board isn't
 *  the org's or the version doesn't belong to it. */
export function setVersionLabel(layoutId: number, versionId: number, orgId: string, label: string | null): boolean {
  if (!getOwnedLayout(layoutId, orgId)) return false;
  const clean = label?.trim().slice(0, 80) || null;
  const r = db.prepare("UPDATE layout_versions SET label = ? WHERE id = ? AND layout_id = ?").run(clean, versionId, layoutId);
  return r.changes > 0;
}

/** The parsed document of one version of an owned board (for restore/preview). */
export function getLayoutVersionDocument(layoutId: number, versionId: number, orgId: string): LayoutT | undefined {
  if (!getOwnedLayout(layoutId, orgId)) return undefined;
  const row = db.prepare("SELECT document FROM layout_versions WHERE id = ? AND layout_id = ?").get(versionId, layoutId) as { document: string } | undefined;
  return row ? parseDocument(JSON.parse(row.document)) : undefined;
}

export function updateLayout(id: number, document: LayoutT, now = Date.now()): LayoutRecord | undefined {
  const existing = getLayout(id);
  if (!existing) return undefined;
  snapshotLayout(id, now); // archive the document we're about to replace
  db.prepare("UPDATE layouts SET document = ?, name = ?, version = version + 1 WHERE id = ?").run(
    JSON.stringify(document),
    document.name,
    id,
  );
  return getLayout(id);
}

export function updateLayoutMeta(
  id: number,
  patch: { name?: string; description?: string; published?: boolean; folder?: string | null },
): LayoutRecord | undefined {
  const existing = getLayout(id);
  if (!existing) return undefined;
  const name = patch.name?.trim() || existing.name;
  // Keep the document's name in sync — it's what screens and exports carry.
  const document = { ...existing.document, name };
  // folder: undefined = leave as-is; "" / null = unfile; a value = move there. (COALESCE
  // can't clear, so resolve the final folder explicitly before the UPDATE.)
  const folder = patch.folder === undefined ? existing.folder : (patch.folder?.trim() || null);
  db.prepare(
    "UPDATE layouts SET name = ?, document = ?, description = COALESCE(?, description), published = COALESCE(?, published), folder = ? WHERE id = ?",
  ).run(
    name,
    JSON.stringify(document),
    patch.description ?? null,
    patch.published === undefined ? null : patch.published ? 1 : 0,
    folder,
    id,
  );
  return getLayout(id);
}

/** #107 — archive (soft-delete) or restore a board. Org-scoped; returns false if not owned. */
export function setArchived(id: number, orgId: string, archived: boolean, now = Date.now()): boolean {
  return db.prepare("UPDATE layouts SET archived_at = ? WHERE id = ? AND org_id = ?").run(archived ? now : null, id, orgId).changes > 0;
}

/** Returns the ids of devices that were using the layout (they need a push). */
export function deleteLayout(id: number): string[] {
  const affected = (
    db.prepare("SELECT id FROM devices WHERE layout_id = ?").all(id) as Array<{ id: string }>
  ).map((d) => d.id);
  db.prepare("DELETE FROM layouts WHERE id = ?").run(id); // devices.layout_id → NULL via FK
  return affected;
}

function mapHubItem(row: LayoutRow & { author: string }): HubItem {
  const record = toRecord(row);
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    author: row.author,
    importCount: record.importCount,
    document: record.document,
    reviewStatus: record.reviewStatus,
  };
}

// The public gallery: only APPROVED published boards (moderation gate).
export function listPublished(q?: string): HubItem[] {
  const filter = q ? `%${q}%` : "%";
  const rows = db
    .prepare(
      `SELECT l.*, COALESCE(u.name, 'GlanceOS') AS author
       FROM layouts l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.published = 1 AND l.review_status = 'approved' AND (l.name LIKE ? OR l.description LIKE ?)
       ORDER BY l.import_count DESC, l.id`,
    )
    .all(filter, filter) as Array<LayoutRow & { author: string }>;
  return rows.map(mapHubItem);
}

// Admin review queue: published boards awaiting approval.
export function listPendingTemplates(): HubItem[] {
  const rows = db
    .prepare(
      `SELECT l.*, COALESCE(u.name, 'GlanceOS') AS author
       FROM layouts l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.published = 1 AND l.review_status = 'pending'
       ORDER BY l.id DESC`,
    )
    .all() as Array<LayoutRow & { author: string }>;
  return rows.map(mapHubItem);
}

/** Submit an owned board to the template gallery — published but pending review. */
export function publishForReview(id: number, description: string): LayoutRecord | undefined {
  if (!getLayout(id)) return undefined;
  db.prepare("UPDATE layouts SET published = 1, review_status = 'pending', description = ? WHERE id = ?").run(description, id);
  return getLayout(id);
}

/** Admin moderation: approve a pending template, or reject it (unpublish). */
export function setReviewStatus(id: number, approved: boolean): LayoutRecord | undefined {
  const existing = getLayout(id);
  if (!existing) return undefined;
  if (approved) db.prepare("UPDATE layouts SET review_status = 'approved' WHERE id = ?").run(id);
  else db.prepare("UPDATE layouts SET published = 0, review_status = 'pending' WHERE id = ?").run(id);
  return getLayout(id);
}

export function importFromHub(hubId: number, userId: string, orgId: string): LayoutRecord | undefined {
  const source = getLayout(hubId);
  if (!source || !source.published || source.reviewStatus !== "approved") return undefined;
  db.prepare("UPDATE layouts SET import_count = import_count + 1 WHERE id = ?").run(hubId);
  return createLayout(source.name, { ...source.document, name: source.name }, { userId, orgId });
}
