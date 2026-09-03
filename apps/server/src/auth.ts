import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { isValidTimezone } from "./devices";

// Multi-user auth. scrypt from node:crypto — for account passwords here, the
// stdlib KDF beats carrying a native dependency (argon2 is the upgrade path).

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

// #155 — a user's default theme for every NEW board. Values mirror the schema's theme enums;
// sanitize() keeps only known values so a bad payload can never produce an unparseable board.
export interface BoardDefaults { mode?: "light" | "dark" | "auto"; fontScale?: "s" | "m" | "l"; look?: "editorial" | "terminal" | "grotesk" | "stencil" }
const BD_MODES = ["light", "dark", "auto"], BD_SCALES = ["s", "m", "l"], BD_LOOKS = ["editorial", "terminal", "grotesk", "stencil"];
export function sanitizeBoardDefaults(v: unknown): BoardDefaults | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out: BoardDefaults = {};
  if (BD_MODES.includes(o.mode as string)) out.mode = o.mode as BoardDefaults["mode"];
  if (BD_SCALES.includes(o.fontScale as string)) out.fontScale = o.fontScale as BoardDefaults["fontScale"];
  if (BD_LOOKS.includes(o.look as string)) out.look = o.look as BoardDefaults["look"];
  return Object.keys(out).length ? out : null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  defaultTimezone: string | null;
  // The account "home" location (city search or one-time browser geolocation).
  // Used as the fallback for geo blocks / screens with no location of their own.
  homeLocationName: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  // #147 — the user's personal "home board": shows on any of their screens with no board of
  // its own (and only when that board belongs to the screen's org). null = no home board.
  homeLayoutId: number | null;
  // #155 — the default theme applied to every NEW board (existing boards untouched). null = stock.
  boardDefaults: BoardDefaults | null;
  // #42 — minute of the user's LOCAL day the emailed daily brief goes out. null = off.
  dailyBriefAt: number | null;
  // #47 — alert digest: hold non-critical wall alerts and deliver one summary every N
  // minutes. null/0 = off (alerts interrupt as they happen).
  alertDigestMin: number | null;
  isAdmin: boolean;
  onboardedAt: number | null;
  activatedAt: number | null;
  emailVerified: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: number;
  default_timezone: string | null;
  home_location_name: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  home_layout_id: number | null;
  board_defaults: string | null;
  daily_brief_at: number | null;
  alert_digest_min: number | null;
  is_admin: number;
  onboarded_at: number | null;
  activated_at: number | null;
  email_verified: number;
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
  let boardDefaults: BoardDefaults | null = null;
  if (row.board_defaults) { try { boardDefaults = sanitizeBoardDefaults(JSON.parse(row.board_defaults)); } catch { /* malformed → stock */ } }
  return {
    id: row.id, name: row.name, email: row.email, defaultTimezone: row.default_timezone ?? null,
    homeLocationName: row.home_location_name ?? null, homeLatitude: row.home_latitude ?? null, homeLongitude: row.home_longitude ?? null,
    homeLayoutId: row.home_layout_id ?? null,
    boardDefaults,
    dailyBriefAt: row.daily_brief_at ?? null,
    alertDigestMin: row.alert_digest_min ?? null,
    isAdmin: (row.is_admin ?? 0) === 1,
    onboardedAt: row.onboarded_at ?? null, activatedAt: row.activated_at ?? null,
    emailVerified: (row.email_verified ?? 0) === 1,
  };
}

const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

/** Mint a single-use token (email verification or password reset). */
export function mintAuthToken(userId: string, kind: "verify" | "reset"): string {
  const token = randomBytes(24).toString("hex");
  const ttl = kind === "verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  db.prepare("INSERT INTO auth_tokens (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)").run(token, userId, kind, Date.now() + ttl);
  return token;
}

/** Redeem a token of the given kind → its user id, marking it used. null if invalid. */
export function consumeAuthToken(token: string, kind: "verify" | "reset"): string | null {
  const row = db.prepare("SELECT user_id FROM auth_tokens WHERE token = ? AND kind = ? AND used_at IS NULL AND expires_at > ?")
    .get(token, kind, Date.now()) as { user_id: string } | undefined;
  if (!row) return null;
  db.prepare("UPDATE auth_tokens SET used_at = ? WHERE token = ?").run(Date.now(), token);
  return row.user_id;
}

export function markEmailVerified(userId: string): void {
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
}

/** Set a new password directly (used by the reset flow after a valid token). */
export function setPassword(userId: string, next: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), userId);
}

/** Stamp the first-run wizard as done (idempotent). */
export function markOnboarded(userId: string): void {
  db.prepare("UPDATE users SET onboarded_at = COALESCE(onboarded_at, ?) WHERE id = ?").run(Date.now(), userId);
}

/** Stamp activation the first time it happens; returns true only on that first stamp
 *  (so the caller emits the "activated" funnel event exactly once). */
export function markActivated(userId: string): boolean {
  const changed = db.prepare("UPDATE users SET activated_at = ? WHERE id = ? AND activated_at IS NULL").run(Date.now(), userId).changes;
  return changed > 0;
}

/** The account's home coordinates, or null if unset — the geo fallback after a
 *  screen's own location. */
export function userHomeGeo(userId: string): { lat: number; lon: number } | null {
  const row = db.prepare("SELECT home_latitude AS lat, home_longitude AS lon FROM users WHERE id = ?").get(userId) as { lat: number | null; lon: number | null } | undefined;
  return row && typeof row.lat === "number" && typeof row.lon === "number" ? { lat: row.lat, lon: row.lon } : null;
}

export function userCount(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

/** The instance owner — the first registered account — is the admin who reviews
 *  submitted templates. Cheap point lookup, no caching needed. */
export function isUserAdmin(userId: string): boolean {
  const row = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(userId) as { is_admin: number } | undefined;
  return (row?.is_admin ?? 0) === 1;
}

// The first account can always be created — otherwise a fresh deploy with
// GLANCEOS_REGISTRATION=closed would be unenterable.
export function registrationOpen(): boolean {
  if (userCount() === 0) return true;
  return process.env.GLANCEOS_REGISTRATION !== "closed";
}

export function createUser(name: string, email: string, password: string): PublicUser | null {
  // The very first account on a fresh install becomes the admin (template reviewer).
  const firstUser = userCount() === 0;
  const user: UserRow = {
    id: randomUUID(),
    name: name.trim(),
    email: email.trim(),
    password_hash: hashPassword(password),
    created_at: Date.now(),
    default_timezone: null,
    home_location_name: null,
    home_latitude: null,
    home_longitude: null,
    home_layout_id: null,
    board_defaults: null,
    daily_brief_at: null,
    alert_digest_min: null,
    is_admin: firstUser ? 1 : 0,
    onboarded_at: null,
    activated_at: null,
    email_verified: 0, // soft flag; verified via emailed link (never blocks login)
  };
  try {
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, created_at, is_admin) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(user.id, user.name, user.email, user.password_hash, user.created_at, user.is_admin);
  } catch {
    return null; // email UNIQUE (case-insensitive) violated
  }
  return toPublic(user);
}

/**
 * Change an account's sign-in address. Operator-only (the passwd CLI): a v0.1 install
 * migrates its single password into an "admin@local" account, and that address can't
 * pass the API's email validation, so without this the upgrade path is a locked door.
 * Returns false if the address is already taken (UNIQUE is case-insensitive).
 */
export function setEmail(userId: string, next: string): boolean {
  try {
    const r = db.prepare("UPDATE users SET email = ? WHERE id = ?").run(next.trim(), userId);
    return r.changes > 0;
  } catch {
    return false; // email UNIQUE (case-insensitive) violated
  }
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

/** Look up an account by email (case-insensitive, per the UNIQUE collation). Used
 *  to resolve a share grantee. Returns null if no such account exists. */
export function getUserByEmail(email: string): PublicUser | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as UserRow | undefined;
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

/** Set (or clear) the account's default timezone. Returns null on a bogus zone. */
export function updateUserTimezone(userId: string, tz: string | null): PublicUser | null {
  const trimmed = tz?.trim() || null;
  if (trimmed && !isValidTimezone(trimmed)) return null;
  db.prepare("UPDATE users SET default_timezone = ? WHERE id = ?").run(trimmed, userId);
  return getUser(userId);
}

/** Set (or clear, with null) the account home location. Coordinates are bounded;
 *  an out-of-range or partial location is rejected (returns null). */
export function setUserHome(userId: string, home: { name: string; latitude: number; longitude: number } | null): PublicUser | null {
  if (home === null) {
    db.prepare("UPDATE users SET home_location_name = NULL, home_latitude = NULL, home_longitude = NULL WHERE id = ?").run(userId);
    return getUser(userId);
  }
  const { name, latitude, longitude } = home;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  db.prepare("UPDATE users SET home_location_name = ?, home_latitude = ?, home_longitude = ? WHERE id = ?").run(String(name).slice(0, 120), latitude, longitude, userId);
  return getUser(userId);
}

/** Set (or clear with null) the account's home board. The CALLER must validate that the
 *  layout belongs to the user's org first — this is a plain setter (auth.ts stays free of a
 *  layouts dependency). currentLayoutId re-checks org ownership at resolve time too. */
export function setUserHomeLayout(userId: string, layoutId: number | null): PublicUser | null {
  db.prepare("UPDATE users SET home_layout_id = ? WHERE id = ?").run(layoutId, userId);
  return getUser(userId);
}

/** #42 — set (or clear with null) when the emailed daily brief goes out (minute of local day). */
export function setUserDailyBrief(userId: string, atMinute: number | null): PublicUser | null {
  db.prepare("UPDATE users SET daily_brief_at = ? WHERE id = ?").run(atMinute, userId);
  return getUser(userId);
}

/** #47 — set (or clear with null) the alert digest window in minutes. */
export function setUserAlertDigest(userId: string, minutes: number | null): PublicUser | null {
  db.prepare("UPDATE users SET alert_digest_min = ? WHERE id = ?").run(minutes, userId);
  return getUser(userId);
}

/** #155 — set (or clear with null) the default theme for the user's NEW boards. Sanitized. */
export function setUserBoardDefaults(userId: string, defaults: unknown): PublicUser | null {
  const clean = sanitizeBoardDefaults(defaults);
  db.prepare("UPDATE users SET board_defaults = ? WHERE id = ?").run(clean ? JSON.stringify(clean) : null, userId);
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
 *  connections, oauth apps, tasks, notifications, uploads and sessions. */
export function deleteUser(userId: string, password: string): boolean {
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  if (!row || !verifyHash(password, row.password_hash)) return false;
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return true;
}
