// #84 — reusable/master blocks: org-scoped component definitions (type + props + style) that
// blocks reference via `instanceOf` and expand to at compose time. A leaf module (only db +
// schema types), so anything can use it without an import cycle.
import type { MasterDef } from "@glanceos/schema";
import { db } from "./db";

export interface MasterSummary { id: string; name: string; type: string; props: unknown; style: unknown; updatedAt: number }
interface MasterRow { id: string; user_id: string; org_id: string | null; name: string; type: string; props: string; style: string | null; created_at: number; updated_at: number }

const parse = (s: string | null): unknown => { if (s == null) return undefined; try { return JSON.parse(s); } catch { return undefined; } };
const toSummary = (r: MasterRow): MasterSummary => ({ id: r.id, name: r.name, type: r.type, props: parse(r.props), style: parse(r.style), updatedAt: r.updated_at });

/** An org's masters (newest first) — full content, so the config editor can expand instances. */
export function listMasters(orgId: string): MasterSummary[] {
  return (db.prepare("SELECT * FROM master_blocks WHERE org_id = ? ORDER BY created_at DESC, id DESC").all(orgId) as MasterRow[]).map(toSummary);
}

/** A masterId → {type, props, style} map for expandInstances(), scoped to an org. */
export function mastersMapForOrg(orgId: string | null): Map<string, MasterDef> {
  const m = new Map<string, MasterDef>();
  if (!orgId) return m;
  for (const r of db.prepare("SELECT id, type, props, style FROM master_blocks WHERE org_id = ?").all(orgId) as MasterRow[]) {
    m.set(r.id, { type: r.type as MasterDef["type"], props: parse(r.props), style: parse(r.style) as MasterDef["style"] });
  }
  return m;
}

const rid = (): string => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function createMaster(userId: string, orgId: string | null, m: { name: string; type: string; props: unknown; style?: unknown }, now = Date.now()): MasterSummary | null {
  const name = m.name.trim().slice(0, 80);
  if (!name || !m.type) return null;
  const id = rid();
  db.prepare("INSERT INTO master_blocks (id, user_id, org_id, name, type, props, style, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, orgId, name, m.type, JSON.stringify(m.props ?? {}), m.style != null ? JSON.stringify(m.style) : null, now, now);
  return { id, name, type: m.type, props: m.props ?? {}, style: m.style, updatedAt: now };
}

/** Update a master's content (and/or name). Only fields present in `patch` change. Org-checked. */
export function updateMaster(id: string, orgId: string, patch: { name?: string; props?: unknown; style?: unknown }, now = Date.now()): boolean {
  const row = db.prepare("SELECT * FROM master_blocks WHERE id = ? AND org_id = ?").get(id, orgId) as MasterRow | undefined;
  if (!row) return false;
  const name = patch.name !== undefined ? (patch.name.trim().slice(0, 80) || row.name) : row.name;
  const props = patch.props !== undefined ? JSON.stringify(patch.props) : row.props;
  const style = patch.style !== undefined ? (patch.style != null ? JSON.stringify(patch.style) : null) : row.style;
  db.prepare("UPDATE master_blocks SET name = ?, props = ?, style = ?, updated_at = ? WHERE id = ? AND org_id = ?").run(name, props, style, now, id, orgId);
  return true;
}

export function deleteMaster(id: string, orgId: string): boolean {
  return db.prepare("DELETE FROM master_blocks WHERE id = ? AND org_id = ?").run(id, orgId).changes > 0;
}
