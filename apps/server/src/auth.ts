import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

// Multi-user auth. scrypt from node:crypto — for account passwords here, the
// stdlib KDF beats carrying a native dependency (argon2 is the upgrade path).

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

interface UserRow extends PublicUser {
  password_hash: string;
  created_at: number;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const candidate = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function toPublic(row: UserRow): PublicUser {
  return { id: row.id, name: row.name, email: row.email };
}

export function userCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

// The first account can always be created — otherwise a fresh deploy with
// GLANCEOS_REGISTRATION=closed would be unenterable.
export function registrationOpen(): boolean {
  if (userCount() === 0) return true;
  return process.env.GLANCEOS_REGISTRATION !== "closed";
}

export function createUser(name: string, email: string, password: string): PublicUser | null {
  const user: UserRow = {
    id: randomUUID(),
    name: name.trim(),
    email: email.trim(),
    password_hash: hashPassword(password),
    created_at: Date.now(),
  };
  try {
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(user.id, user.name, user.email, user.password_hash, user.created_at);
  } catch {
    return null; // email UNIQUE (case-insensitive) violated
  }
  return toPublic(user);
}

export function verifyLogin(email: string, password: string): PublicUser | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as
    | UserRow
    | undefined;
  if (!row || !verifyHash(password, row.password_hash)) return null;
  return toPublic(row);
}

export function getUser(id: string): PublicUser | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? toPublic(row) : null;
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    now,
    expiresAt,
  );
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now); // opportunistic sweep
  return { token, expiresAt };
}

export function sessionUserId(token: string | undefined): string | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?")
    .get(token, Date.now()) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}

export function destroySession(token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ---- account management ----

export function updateUserName(userId: string, name: string): PublicUser | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(trimmed, userId);
  return getUser(userId);
}

/** Verify the current password, then set a new one. false if current is wrong. */
export function changePassword(userId: string, current: string, next: string): boolean {
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  if (!row || !verifyHash(current, row.password_hash)) return false;
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), userId);
  return true;
}

/** Log out everywhere — invalidate every session for this user (incl. the current one). */
export function destroyAllSessions(userId: string): void {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** Delete the account after verifying the password. Every user-scoped table
 *  cascades on user_id (foreign_keys = ON), so this removes layouts, devices,
 *  playlists, connections, oauth apps, tasks, notifications, uploads and sessions. */
export function deleteUser(userId: string, password: string): boolean {
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  if (!row || !verifyHash(password, row.password_hash)) return false;
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return true;
}
