import type { CustomDataT } from "@glanceos/schema";
import { db } from "./db";
import { clearMetric, logMetric, toMetricNumber } from "./metrics";

// A per-user key→JSON store (PRIMARY KEY (user_id, key)). The "customData" block
// reads it; the public API (data:write), webhooks, and automations write it.
// Values are stored JSON-encoded; we cap per-value size and per-user key count so
// a runaway writer can't fill the disk.

export const MAX_VALUE_BYTES = 256 * 1024; // 256 KB per value
export const MAX_KEYS_PER_USER = 500;

export interface CustomDataRow { user_id: string; key: string; value: string; updated_at: number; private: number }
export interface CustomDataEntry { key: string; value: unknown; updatedAt: number; private: boolean }

const parse = (json: string): unknown => { try { return JSON.parse(json); } catch { return null; } };

/** Read one key's decoded value, or undefined if unset. */
export function getCustomData(userId: string, key: string): unknown {
  const row = db.prepare("SELECT value FROM custom_data WHERE user_id = ? AND key = ?").get(userId, key) as { value: string } | undefined;
  return row ? parse(row.value) : undefined;
}

/** All of a user's entries, newest first. */
export function listCustomData(userId: string): CustomDataEntry[] {
  return (db.prepare("SELECT key, value, updated_at, private FROM custom_data WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC").all(userId) as CustomDataRow[])
    .map((r) => ({ key: r.key, value: parse(r.value), updatedAt: r.updated_at, private: r.private === 1 }));
}

// ---- #156 private data vault ----

/** Is this key marked private? (private = renders only for the owner's own screens). */
export function isDataPrivate(userId: string, key: string): boolean {
  const row = db.prepare("SELECT private FROM custom_data WHERE user_id = ? AND key = ?").get(userId, key) as { private: number } | undefined;
  return row?.private === 1;
}

/** Mark a key private (or public again). false if the key doesn't exist. */
export function setDataPrivacy(userId: string, key: string, priv: boolean): boolean {
  return db.prepare("UPDATE custom_data SET private = ? WHERE user_id = ? AND key = ?").run(priv ? 1 : 0, userId, key).changes > 0;
}

export type SetResult = { ok: true; entry: CustomDataEntry } | { ok: false; error: "too_large" | "too_many_keys" | "bad_key" };

/** Upsert a value. Rejects oversized values and, for brand-new keys, a user over
 *  the key cap (existing keys can always be overwritten). */
export function setCustomData(userId: string, key: string, value: unknown, now = Date.now()): SetResult {
  const k = key.trim();
  if (!k || k.length > 100) return { ok: false, error: "bad_key" };
  const json = JSON.stringify(value ?? null);
  if (Buffer.byteLength(json, "utf8") > MAX_VALUE_BYTES) return { ok: false, error: "too_large" };

  const exists = db.prepare("SELECT 1 FROM custom_data WHERE user_id = ? AND key = ?").get(userId, k);
  if (!exists) {
    const count = (db.prepare("SELECT COUNT(*) AS n FROM custom_data WHERE user_id = ?").get(userId) as { n: number }).n;
    if (count >= MAX_KEYS_PER_USER) return { ok: false, error: "too_many_keys" };
  }
  db.prepare(
    "INSERT INTO custom_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(userId, k, json, now);
  // #27 — a numeric value also accumulates a time series (metric history) so it can be charted.
  const num = toMetricNumber(value);
  if (num != null) logMetric(userId, k, num, now);
  // #156 — an upsert keeps the key's existing privacy (the column is untouched); report it back.
  return { ok: true, entry: { key: k, value: value ?? null, updatedAt: now, private: isDataPrivate(userId, k) } };
}

export function deleteCustomData(userId: string, key: string): boolean {
  const gone = db.prepare("DELETE FROM custom_data WHERE user_id = ? AND key = ?").run(userId, key).changes > 0;
  clearMetric(userId, key); // #27 — deleting a key also clears its recorded history (no orphan trail)
  return gone;
}

/** Widget-facing resolver for a "customData" block. Returns null when no key is
 *  configured (screen falls back to its label), or {value}/{error} otherwise. */
export function customDataWidget(props: { key: string }, userId: string, publicView = false): CustomDataT | null {
  if (!props.key?.trim()) return null;
  const key = props.key.trim();
  // #156 — a private key never renders on a public share (null, not an error: the block falls
  // back to its typed props/fallback, and the key's very existence isn't confirmed).
  if (publicView && isDataPrivate(userId, key)) return null;
  const v = getCustomData(userId, key);
  if (v === undefined) return { error: "no data" };
  return { value: v as CustomDataT["value"] };
}
