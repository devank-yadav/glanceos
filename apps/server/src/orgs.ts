import { randomBytes, randomUUID } from "node:crypto";
import { getUser } from "./auth";
import { db } from "./db";
import type { Access } from "./shares";

// Organizations: the multi-tenant team layer (and future billing entity). An org owns
// boards/screens/etc. (org_id on those tables); membership + roles live in org_members.
// Every account has a hidden PERSONAL org it solely owns, so a solo user sees no team
// chrome. This module is the ONLY authority on "what org is a request acting in, and
// with what role" — modeled on shares.ts so the access story stays in one mental model.

export type Role = "owner" | "admin" | "editor" | "viewer";
export const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const ROLES = new Set<Role>(["owner", "admin", "editor", "viewer"]);
export const isRole = (r: string): r is Role => ROLES.has(r as Role);

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

export interface OrgRow { id: string; name: string; slug: string; personal: number; created_by: string | null; plan: string; plan_ref: string | null; created_at: number; stripe_customer_id: string | null; stripe_subscription_id: string | null; plan_status: string; screens_paid: number; current_period_end: number | null }
export interface OrgSummary { id: string; name: string; slug: string; personal: boolean; role: Role; plan: string }
export interface MemberSummary { userId: string; name: string; email: string; role: Role; createdAt: number }
export interface InviteSummary { token: string; email: string; role: Role; invitedBy: string | null; expiresAt: number; createdAt: number }

// Org role → the board/screen Access vocabulary shares.ts already speaks: owner+admin
// get full control (incl. re-sharing/delete), editor writes, viewer reads. Lets the
// shares helpers fold org membership in without learning a second permission language.
export function accessForRole(role: Role): Access {
  return role === "owner" || role === "admin" ? "owner" : role === "editor" ? "editor" : "viewer";
}
export const canManageMembers = (role: Role): boolean => role === "owner" || role === "admin";

const slugify = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "team";

// ---- reads ----

export function getOrg(orgId: string): OrgRow | undefined {
  return db.prepare("SELECT * FROM organizations WHERE id = ?").get(orgId) as OrgRow | undefined;
}

/** A user's role in an org, or null if they're not a member — the membership gate. */
export function memberRole(orgId: string, userId: string): Role | null {
  const row = db.prepare("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?").get(orgId, userId) as { role: string } | undefined;
  return row && isRole(row.role) ? row.role : null;
}

/** Every org a user belongs to (personal first), with their role — for the switcher. */
export function listOrgsForUser(userId: string): OrgSummary[] {
  const rows = db.prepare(
    `SELECT o.id, o.name, o.slug, o.personal, o.plan, m.role
     FROM org_members m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = ? ORDER BY o.personal DESC, o.created_at`,
  ).all(userId) as Array<OrgRow & { role: string }>;
  return rows.filter((r) => isRole(r.role)).map((r) => ({ id: r.id, name: r.name, slug: r.slug, personal: r.personal === 1, role: r.role as Role, plan: r.plan }));
}

export function listMembers(orgId: string): MemberSummary[] {
  const rows = db.prepare("SELECT user_id, role, created_at FROM org_members WHERE org_id = ? ORDER BY created_at").all(orgId) as Array<{ user_id: string; role: string; created_at: number }>;
  return rows.flatMap((r) => {
    const u = getUser(r.user_id);
    return u && isRole(r.role) ? [{ userId: u.id, name: u.name, email: u.email, role: r.role as Role, createdAt: r.created_at }] : [];
  });
}

const ownerCount = (orgId: string): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ? AND role = 'owner'").get(orgId) as { n: number }).n;

// ---- writes ----

/** Create an org + add the creator as owner. `personal` marks the hidden solo org. */
export function createOrg(name: string, ownerId: string, opts: { personal?: boolean } = {}): OrgRow {
  const id = randomUUID();
  const now = Date.now();
  const slug = opts.personal ? `u-${ownerId}` : `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  db.prepare("INSERT INTO organizations (id, name, slug, personal, created_by, plan, created_at) VALUES (?, ?, ?, ?, ?, 'free', ?)")
    .run(id, name.trim() || "Workspace", slug, opts.personal ? 1 : 0, ownerId, now);
  db.prepare("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(id, ownerId, now);
  return getOrg(id)!;
}

/** The user's personal org id, creating it if missing (new signups + self-heal). */
export function ensurePersonalOrg(userId: string): string {
  const row = db.prepare("SELECT id FROM organizations WHERE created_by = ? AND personal = 1").get(userId) as { id: string } | undefined;
  if (row) return row.id;
  const name = `${getUser(userId)?.name ?? "My"}'s workspace`;
  return createOrg(name, userId, { personal: true }).id;
}

export function renameOrg(orgId: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return db.prepare("UPDATE organizations SET name = ? WHERE id = ? AND personal = 0").run(trimmed, orgId).changes > 0;
}

/** Delete a team org (never a personal one). Cascades its boards/screens via org_id FKs. */
export function deleteOrg(orgId: string): boolean {
  return db.prepare("DELETE FROM organizations WHERE id = ? AND personal = 0").run(orgId).changes > 0;
}

export type RoleChange = "ok" | "not_member" | "last_owner" | "bad_role";

/** Change a member's role. Guards: valid role, target exists, never strand an org
 *  with zero owners (can't demote the last owner). */
export function changeRole(orgId: string, targetUserId: string, role: Role): RoleChange {
  if (!isRole(role)) return "bad_role";
  const current = memberRole(orgId, targetUserId);
  if (!current) return "not_member";
  if (current === "owner" && role !== "owner" && ownerCount(orgId) <= 1) return "last_owner";
  db.prepare("UPDATE org_members SET role = ? WHERE org_id = ? AND user_id = ?").run(role, orgId, targetUserId);
  return "ok";
}

export type MemberRemoval = "ok" | "not_member" | "last_owner";

export function removeMember(orgId: string, targetUserId: string): MemberRemoval {
  const current = memberRole(orgId, targetUserId);
  if (!current) return "not_member";
  if (current === "owner" && ownerCount(orgId) <= 1) return "last_owner";
  db.prepare("DELETE FROM org_members WHERE org_id = ? AND user_id = ?").run(orgId, targetUserId);
  return "ok";
}

// ---- invites ----

export type InviteResult = { ok: true; token: string } | { ok: false; error: "bad_role" | "already_member" };

/** Create an invite row (the email is sent by the caller in Phase 3). Inviting as
 *  "owner" is disallowed — ownership is granted via changeRole by an existing owner. */
export function createInvite(orgId: string, email: string, role: Role, byUserId: string): InviteResult {
  if (!isRole(role) || role === "owner") return { ok: false, error: "bad_role" };
  const existing = db.prepare(
    "SELECT 1 FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.email = ?",
  ).get(orgId, email.trim());
  if (existing) return { ok: false, error: "already_member" };
  const token = randomBytes(24).toString("hex");
  db.prepare("INSERT INTO org_invites (token, org_id, email, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(token, orgId, email.trim(), role, byUserId, Date.now() + INVITE_TTL_MS);
  return { ok: true, token };
}

export function listInvites(orgId: string): InviteSummary[] {
  const rows = db.prepare("SELECT token, email, role, invited_by, expires_at FROM org_invites WHERE org_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY expires_at DESC")
    .all(orgId, Date.now()) as Array<{ token: string; email: string; role: string; invited_by: string | null; expires_at: number }>;
  return rows.filter((r) => isRole(r.role)).map((r) => ({ token: r.token, email: r.email, role: r.role as Role, invitedBy: r.invited_by, expiresAt: r.expires_at, createdAt: r.expires_at - INVITE_TTL_MS }));
}

export function revokeInvite(orgId: string, token: string): boolean {
  return db.prepare("DELETE FROM org_invites WHERE org_id = ? AND token = ?").run(orgId, token).changes > 0;
}

export interface InvitePreview { org: { id: string; name: string }; email: string; role: Role; invitedBy: string | null }

/** Inspect an invite without consuming it (the accept-invite landing screen). */
export function getInvite(token: string): InvitePreview | null {
  const row = db.prepare("SELECT * FROM org_invites WHERE token = ? AND accepted_at IS NULL AND expires_at > ?").get(token, Date.now()) as
    | { org_id: string; email: string; role: string; invited_by: string | null } | undefined;
  if (!row || !isRole(row.role)) return null;
  const org = getOrg(row.org_id);
  if (!org) return null;
  return { org: { id: org.id, name: org.name }, email: row.email, role: row.role as Role, invitedBy: row.invited_by ? getUser(row.invited_by)?.name ?? null : null };
}

export type AcceptResult = { ok: true; orgId: string } | { ok: false; error: "invalid" };

/** Consume an invite: add (or upgrade) the user's membership and mark it accepted.
 *  The token is the bearer secret — we don't require the logged-in email to match. */
export function acceptInvite(token: string, userId: string): AcceptResult {
  const row = db.prepare("SELECT * FROM org_invites WHERE token = ? AND accepted_at IS NULL AND expires_at > ?").get(token, Date.now()) as
    | { token: string; org_id: string; role: string } | undefined;
  if (!row || !isRole(row.role)) return { ok: false, error: "invalid" };
  const now = Date.now();
  db.prepare(
    "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role",
  ).run(row.org_id, userId, row.role, now);
  db.prepare("UPDATE org_invites SET accepted_at = ? WHERE token = ?").run(now, row.token);
  return { ok: true, orgId: row.org_id };
}

// ---- active-org session state + the request resolver ----

export function getSessionActiveOrg(token: string | undefined): string | null {
  if (!token) return null;
  const row = db.prepare("SELECT active_org_id FROM sessions WHERE token = ?").get(token) as { active_org_id: string | null } | undefined;
  return row?.active_org_id ?? null;
}

export function setSessionActiveOrg(token: string | undefined, orgId: string): void {
  if (token) db.prepare("UPDATE sessions SET active_org_id = ? WHERE token = ?").run(orgId, token);
}

/** Resolve the org a request is acting in, with the actor's role. SELF-HEALING: a
 *  null/stale/revoked active_org_id falls back to the user's personal org (created if
 *  needed) and is persisted — a removed member can never be left pointing at an org they
 *  no longer belong to, and never 500s or leaks. The single tenant-isolation chokepoint. */
export function resolveOrgForRequest(userId: string, sessionToken: string | undefined): { orgId: string; role: Role } {
  const stored = getSessionActiveOrg(sessionToken);
  if (stored) {
    const role = memberRole(stored, userId);
    if (role) return { orgId: stored, role };
  }
  const orgId = ensurePersonalOrg(userId);
  setSessionActiveOrg(sessionToken, orgId);
  return { orgId, role: memberRole(orgId, userId) ?? "owner" };
}
