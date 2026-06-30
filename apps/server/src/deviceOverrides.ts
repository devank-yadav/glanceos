// #48 — per-device block overrides: a screen showing a shared board can override specific
// blocks' props (merged in at compose time), so e.g. the kitchen screen's weather block uses the
// kitchen's location. A leaf module (db + schema types only) so the compose path can use it
// without a cycle.
import type { LayoutT, RowT } from "@glanceos/schema";
import { db } from "./db";

export interface DeviceOverride { blockId: string; props: Record<string, unknown> }

const parseObj = (s: string): Record<string, unknown> => {
  try { const o = JSON.parse(s); return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {}; } catch { return {}; }
};

/** A device's overrides (one per block). */
export function listOverrides(deviceId: string): DeviceOverride[] {
  return (db.prepare("SELECT block_id, props FROM device_overrides WHERE device_id = ? ORDER BY block_id").all(deviceId) as { block_id: string; props: string }[])
    .map((r) => ({ blockId: r.block_id, props: parseObj(r.props) }));
}

/** A cheap fingerprint of a device's overrides (count + newest updated_at). The e-ink /display
 *  ETag + render cache-buster fold this in so the panel re-renders when an override is added,
 *  edited, or removed — even when the change only touches non-data-bound props (which leave the
 *  resolved `data` untouched, so version+data alone wouldn't notice). "" when the device has none. */
export function overridesSig(deviceId: string): string {
  const r = db.prepare("SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), 0) AS m FROM device_overrides WHERE device_id = ?").get(deviceId) as { c: number; m: number };
  return r.c ? `${r.c}.${r.m}` : "";
}

/** blockId → props-patch map for a device, for applyOverrides() at compose time. */
export function overridesMap(deviceId: string): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  for (const o of listOverrides(deviceId)) if (Object.keys(o.props).length) m.set(o.blockId, o.props);
  return m;
}

/** Set (replace) a block's override patch for a device. An empty patch deletes it. */
export function setOverride(deviceId: string, blockId: string, props: unknown, now = Date.now()): void {
  const patch = props && typeof props === "object" && !Array.isArray(props) ? (props as Record<string, unknown>) : {};
  if (!Object.keys(patch).length) { deleteOverride(deviceId, blockId); return; }
  db.prepare("INSERT INTO device_overrides (device_id, block_id, props, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(device_id, block_id) DO UPDATE SET props = excluded.props, updated_at = excluded.updated_at")
    .run(deviceId, blockId, JSON.stringify(patch), now);
}

export function deleteOverride(deviceId: string, blockId: string): boolean {
  return db.prepare("DELETE FROM device_overrides WHERE device_id = ? AND block_id = ?").run(deviceId, blockId).changes > 0;
}

/** Remove every override for a device (e.g. on un-claim). */
export function clearOverrides(deviceId: string): void {
  db.prepare("DELETE FROM device_overrides WHERE device_id = ?").run(deviceId);
}

/** Pure: merge each override patch over the matching block's props (shallow), keeping everything
 *  else. Walks rows, pages, and zones. Returns the same object when there's nothing to apply. */
export function applyOverrides(doc: LayoutT, map: Map<string, Record<string, unknown>>): LayoutT {
  if (!map.size) return doc;
  let changed = false;
  const fix = (blk: RowT["blocks"][number]): RowT["blocks"][number] => {
    const patch = map.get(blk.id);
    if (!patch) return blk;
    changed = true;
    return { ...blk, props: { ...(blk.props as Record<string, unknown>), ...patch } } as RowT["blocks"][number];
  };
  const fixRows = (rows: RowT[]): RowT[] => rows.map((r) => ({ ...r, blocks: r.blocks.map(fix) }));
  const rows = fixRows(doc.rows);
  const pages = doc.pages ? doc.pages.map(fixRows) : undefined;
  const zones = doc.zones ? doc.zones.map((z) => ({ ...z, rows: fixRows(z.rows) })) : undefined;
  if (!changed) return doc;
  return { ...doc, rows, ...(pages ? { pages } : {}), ...(zones ? { zones } : {}) };
}
