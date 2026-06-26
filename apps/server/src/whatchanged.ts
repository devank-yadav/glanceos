import type { WidgetT } from "@glanceos/schema";

// "What changed since you last looked": per-snapshot-key memory of each board's
// meaningful scalar values, diffed each render so a sinceYouLooked block can show the
// deltas (e.g. "Open PRs 3 → 7", "BTC 61,200 → 58,900"). In-memory by design — it
// re-baselines on restart, exactly like the automation engine's trend/prev history —
// and is keyed per device, so it reflects "since THIS screen last refreshed".

export interface Change { label: string; from: string; to: string }
type Snap = Record<string, { label: string; value: string }>;
const snapshots = new Map<string, Snap>();

const SCALAR_PROPS = ["value", "amount", "count", "number", "percent", "total"];
const LABEL_PROPS = ["label", "title", "name", "heading"];

// A block's current scalar: its resolved live value when bound (a number/string passes
// through, an object yields .value/.count, an array yields its length), else a typed-in
// scalar prop. undefined → not trackable (no clear single value).
function scalarOf(data: unknown, props: Record<string, unknown>): string | undefined {
  if (data != null) {
    if (Array.isArray(data)) return String(data.length);
    if (typeof data === "object") { const v = (data as Record<string, unknown>).value ?? (data as Record<string, unknown>).count; return v == null ? undefined : String(v); }
    return String(data);
  }
  for (const p of SCALAR_PROPS) { const v = props[p]; if (v != null && v !== "") return String(v); }
  return undefined;
}
function labelOf(block: WidgetT, props: Record<string, unknown>): string | undefined {
  for (const p of LABEL_PROPS) { const v = props[p]; if (typeof v === "string" && v.trim()) return v.trim(); }
  return block.name || undefined;
}

/** Diff this render's meaningful scalars against the previous render for `key`, then
 *  store the new snapshot. Returns up to `max` changes; [] on the first look (baseline)
 *  or when nothing moved. Pure aside from the per-key snapshot store. */
export function computeChanges(blocks: WidgetT[], data: Record<string, unknown>, key: string, max = 5): Change[] {
  const cur: Snap = {};
  for (const b of blocks) {
    if (b.type === "sinceYouLooked") continue; // never diff the digest against itself
    const props = b.props as Record<string, unknown>;
    const label = labelOf(b, props);
    const value = scalarOf(data[b.id], props);
    if (label && value != null) cur[b.id] = { label, value };
  }
  const prev = snapshots.get(key);
  snapshots.set(key, cur);
  if (!prev) return []; // first look → baseline; nothing has "changed" yet
  const changes: Change[] = [];
  for (const id of Object.keys(cur)) {
    const p = prev[id];
    if (p && p.value !== cur[id]!.value) changes.push({ label: cur[id]!.label, from: p.value, to: cur[id]!.value });
    if (changes.length >= max) break;
  }
  return changes;
}
