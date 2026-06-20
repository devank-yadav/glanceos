import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The first encrypted-at-rest store in GlanceOS: connection secrets (tokens,
// API keys, secret URLs, OAuth tokens). AES-256-GCM via node:crypto only — no
// new deps, mirroring auth.ts. Key from GLANCEOS_SECRET_KEY; if unset, derive and
// persist a 0600 key file under the data dir so a single-host install just works.

// Bump GLANCEOS_KEY_VERSION when you rotate the key, so connection_secrets /
// oauth_apps rows record which key sealed them.
const KEY_VERSION = Number(process.env.GLANCEOS_KEY_VERSION) || 1;

function readOrCreateInstallKey(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = process.env.GLANCEOS_DATA_DIR ?? join(here, "..", "data");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "secret.key");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const k = randomBytes(32).toString("hex");
  writeFileSync(file, k, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort on non-posix */ }
  console.warn(
    "[secrets] GLANCEOS_SECRET_KEY not set — generated data/secret.key (0600). " +
    "Keep it safe: losing or rotating it makes stored connections undecryptable (they'll need reconnecting).",
  );
  return k;
}

const deriveKey = (secret: string): Buffer => scryptSync(secret, "glanceos.connections", 32);

const BASE_SECRET = process.env.GLANCEOS_SECRET_KEY ?? readOrCreateInstallKey();
const KEY = deriveKey(BASE_SECRET);
// During a key rotation the operator sets the old key here so existing blobs
// still decrypt until `pnpm rotate-secrets` re-encrypts them with the new key.
const PREV_KEY = process.env.GLANCEOS_SECRET_KEY_PREVIOUS ? deriveKey(process.env.GLANCEOS_SECRET_KEY_PREVIOUS) : null;
// Separate derived key for signing (not encrypting) short-lived OAuth `state`.
const HMAC_KEY = scryptSync(BASE_SECRET, "glanceos.hmac", 32);

export const hasPreviousKey = (): boolean => PREV_KEY !== null;

/** HMAC-SHA256 (base64url) for integrity-protected, non-secret tokens like OAuth state. */
export function hmacSign(data: string): string {
  return createHmac("sha256", HMAC_KEY).update(data).digest("base64url");
}
export function hmacVerify(data: string, sig: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(hmacSign(data));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Encrypt with a specific key → Buffer laid out as iv(12) | authTag(16) | ciphertext. */
export function sealWith(key: Buffer, plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

/** Decrypt with a specific key; null on a tampered/wrong-key blob (never throws). */
export function openWith(key: Buffer, buf: Buffer | null | undefined): string | null {
  if (!buf || buf.length < 28) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Seal with the current key. */
export const seal = (plain: string): Buffer => sealWith(KEY, plain);

/** Open with the current key, falling back to the previous key during a rotation. */
export function open(buf: Buffer | null | undefined): string | null {
  const v = openWith(KEY, buf);
  if (v !== null) return v;
  return PREV_KEY ? openWith(PREV_KEY, buf) : null;
}

export const currentKeyVersion = (): number => KEY_VERSION;
