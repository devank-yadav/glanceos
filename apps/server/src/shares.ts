import { randomUUID } from "node:crypto";
import { getUser, getUserByEmail } from "./auth";
import { db } from "./db";
import { getDevice, type DeviceRow } from "./devices";
import { getLayout, type LayoutRecord } from "./layouts";
import { accessForRole, memberRole } from "./orgs";

// Lightweight user-to-user sharing (board OR screen → another account as
// viewer|editor). The access helpers below are the ONLY way a non-owner gains
// access; every existing owner-scoped path is left exactly as-is. api.ts relaxes
// specific read/write routes by calling getReadable*/getWritable* instead of the
// owner-only getOwnedLayout/getDevice+user_id check.

export type Access = "owner" | "editor" | "viewer";
export type ShareKind = "layout" | "device";

export interface ShareRow {
  id: string; owner_id: string; grantee_id: string; kind: ShareKind; target_id: string; access: "viewer" | "editor"; created_at: number;
}

const shareFor = (granteeId: string, kind: ShareKind, targetId: string): ShareRow | undefined =>
  db.prepare("SELECT * FROM shares WHERE grantee_id = ? AND kind = ? AND target_id = ?").get(granteeId, kind, targetId) as ShareRow | undefined;

// Org membership is the PRIMARY ACL: any member of the resource's org gets access at
// their role. A `shares` row remains the fallback for a cross-org / non-member guest.
/** A user's effective access to a layout: via org membership, a guest share, or none. */
export function layoutAccess(id: number, userId: string): Access | null {
  const layout = getLayout(id);
  if (!layout) return null;
  const role = layout.orgId ? memberRole(layout.orgId, userId) : null;
  if (role) return accessForRole(role);
  return shareFor(userId, "layout", String(id))?.access ?? null;
}

export function deviceAccess(id: string, userId: string): Access | null {
  const device = getDevice(id);
  if (!device) return null;
  const role = device.org_id ? memberRole(device.org_id, userId) : null;
  if (role) return accessForRole(role);
  return shareFor(userId, "device", id)?.access ?? null;
}

// Additive read/write getters — owner OR an appropriately-graded grantee.
export const getReadableLayout = (id: number, userId: string): LayoutRecord | undefined =>
  layoutAccess(id, userId) ? getLayout(id) : undefined;
export const getWritableLayout = (id: number, userId: string): LayoutRecord | undefined => {
  const a = layoutAccess(id, userId);
  return a === "owner" || a === "editor" ? getLayout(id) : undefined;
};
export const getReadableDevice = (id: string, userId: string): DeviceRow | undefined =>
  deviceAccess(id, userId) ? getDevice(id) : undefined;
export const getWritableDevice = (id: string, userId: string): DeviceRow | undefined => {
  const a = deviceAccess(id, userId);
  return a === "owner" || a === "editor" ? getDevice(id) : undefined;
};

/** The owner id of a layout (for resolving a shared board's data under the
 *  owner's connections — a grantee must never resolve under their own). */
export const layoutOwnerId = (id: number): string | null => getLayout(id)?.userId ?? null;

// ---- management ----

export type CreateResult = { ok: true; share: ShareRow } | { ok: false; error: "not_owner" | "no_user" | "self" };

export function createShare(ownerId: string, kind: ShareKind, targetId: string, granteeEmail: string, access: "viewer" | "editor"): CreateResult {
  // "Can share" = the actor is a member of the resource's org (org membership is the ACL).
  const orgOf = kind === "layout" ? getLayout(Number(targetId))?.orgId : getDevice(targetId)?.org_id;
  const owns = !!(orgOf && memberRole(orgOf, ownerId));
  if (!owns) return { ok: false, error: "not_owner" };
  const grantee = getUserByEmail(granteeEmail);
  if (!grantee) return { ok: false, error: "no_user" };
  if (grantee.id === ownerId) return { ok: false, error: "self" };
  const id = randomUUID();
  db.prepare(
    `INSERT INTO shares (id, owner_id, grantee_id, kind, target_id, access, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(grantee_id, kind, target_id) DO UPDATE SET access = excluded.access, owner_id = excluded.owner_id`,
  ).run(id, ownerId, grantee.id, kind, targetId, access, Date.now());
  return { ok: true, share: shareFor(grantee.id, kind, targetId)! };
}

export function revokeShare(id: string, ownerId: string): boolean {
  return db.prepare("DELETE FROM shares WHERE id = ? AND owner_id = ?").run(id, ownerId).changes > 0;
}

export function updateShareAccess(id: string, ownerId: string, access: "viewer" | "editor"): boolean {
  return db.prepare("UPDATE shares SET access = ? WHERE id = ? AND owner_id = ?").run(access, id, ownerId).changes > 0;
}

const granteeName = (granteeId: string): string => getUser(granteeId)?.name ?? "someone";
const ownerName = (ownerId: string): string => getUser(ownerId)?.name ?? "someone";

/** Shares the owner has handed out, with target + grantee labels for the UI. */
export function listSharesByOwner(ownerId: string): Array<ShareRow & { targetName: string; granteeName: string }> {
  const rows = db.prepare("SELECT * FROM shares WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId) as ShareRow[];
  return rows.map((s) => ({
    ...s,
    granteeName: granteeName(s.grantee_id),
    targetName: s.kind === "layout" ? getLayout(Number(s.target_id))?.name ?? "(deleted board)" : getDevice(s.target_id)?.name ?? "(deleted screen)",
  }));
}

/** Boards shared WITH this user (layout record + access + owner label). */
export function sharedLayouts(granteeId: string): Array<{ layout: LayoutRecord; access: "viewer" | "editor"; ownerName: string; ownerId: string }> {
  const rows = db.prepare("SELECT * FROM shares WHERE grantee_id = ? AND kind = 'layout' ORDER BY created_at DESC").all(granteeId) as ShareRow[];
  return rows.flatMap((s) => {
    const layout = getLayout(Number(s.target_id));
    return layout ? [{ layout, access: s.access, ownerName: ownerName(s.owner_id), ownerId: s.owner_id }] : [];
  });
}

/** Screens shared WITH this user (device id + access + owner label). */
export function sharedDevices(granteeId: string): Array<{ deviceId: string; access: "viewer" | "editor"; ownerName: string }> {
  const rows = db.prepare("SELECT * FROM shares WHERE grantee_id = ? AND kind = 'device' ORDER BY created_at DESC").all(granteeId) as ShareRow[];
  return rows.filter((s) => getDevice(s.target_id)).map((s) => ({ deviceId: s.target_id, access: s.access, ownerName: ownerName(s.owner_id) }));
}
