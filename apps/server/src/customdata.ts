import type { CustomDataT } from "@glanceos/schema";
import { db } from "./db";

// A per-user key→JSON store (PRIMARY KEY (user_id, key)). The "customData" block
// reads it; the public API (data:write), webhooks, and automations write it.
// Values are stored JSON-encoded; we cap per-value size and per-user key count so
// a runaway writer can't fill the disk.

export const MAX_VALUE_BYTES = 256 * 1024; // 256 KB per value
export const MAX_KEYS_PER_USER = 500;

export interface CustomDataRow { user_id: string; key: string; value: string; updated_at: number }
export interface CustomDataEntry { key: string; value: unknown; updatedAt: number }

const parse = (json: string): unknown => { try { return JSON.parse(json); } catch { return null; } };

/** Read one key's decoded value, or undefined if unset. */
export function getCustomData(userId: string, key: string): unknown {
  const row = db.prepare("SELECT value FROM custom_data WHERE user_id = ? AND key = ?").get(userId, key) as { value: string } | undefined;
  return row ? parse(row.value) : undefined;
}

/** All of a user's entries, newest first. */
export function listCustomData(userId: string): CustomDataEntry[] {
  return (db.prepare("SELECT key, value, updated_at FROM custom_data WHERE user_id = ? ORDER BY updated_at DESC, rowid DESC").all(userId) as CustomDataRow[])
    .map((r) => ({ key: r.key, value: parse(r.value), updatedAt: r.updated_at }));
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
  return { ok: true, entry: { key: k, value: value ?? null, updatedAt: now } };
}

export function deleteCustomData(userId: string, key: string): boolean {
  return db.prepare("DELETE FROM custom_data WHERE user_id = ? AND key = ?").run(userId, key).changes > 0;
}

/** Widget-facing resolver for a "customData" block. Returns null when no key is
 *  configured (screen falls back to its label), or {value}/{error} otherwise. */
export function customDataWidget(props: { key: string }, userId: string): CustomDataT | null {
  if (!props.key?.trim()) return null;
  const v = getCustomData(userId, props.key.trim());
  if (v === undefined) return { error: "no data" };
  return { value: v as CustomDataT["value"] };
}
