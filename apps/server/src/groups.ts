import { db } from "./db";
import { wallClock } from "./schedules";

// Display groups: manage many screens as one. A device with no group is
// unaffected; a grouped device falls back to its group's board/schedule
// when it has none of its own (see state.currentLayoutId). Group schedules reuse
// the device-schedule engine verbatim — just keyed by group.

export interface DisplayGroup {
  id: number;
  name: string;
  timezone: string | null;
  layoutId: number | null;
  deviceCount: number;
}
interface GroupRow { id: number; user_id: string; name: string; timezone: string | null; layout_id: number | null; created_at: number }

function summarize(r: GroupRow): DisplayGroup {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM devices WHERE group_id = ?").get(r.id) as { n: number };
  return { id: r.id, name: r.name, timezone: r.timezone, layoutId: r.layout_id, deviceCount: n };
}

export function getOwnedGroup(id: number, userId: string): GroupRow | undefined {
  return db.prepare("SELECT * FROM display_groups WHERE id = ? AND user_id = ?").get(id, userId) as GroupRow | undefined;
}
export function getGroupRow(id: number): GroupRow | undefined {
  return db.prepare("SELECT * FROM display_groups WHERE id = ?").get(id) as GroupRow | undefined;
}

export function listGroups(userId: string): DisplayGroup[] {
  const rows = db.prepare("SELECT * FROM display_groups WHERE user_id = ? ORDER BY name LIMIT 1000").all(userId) as GroupRow[];
  return rows.map(summarize);
}

export function createGroup(userId: string, name: string, timezone: string | null): DisplayGroup {
  const r = db.prepare("INSERT INTO display_groups (user_id, name, timezone, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, name.trim() || "Group", timezone, Date.now());
  return summarize(getOwnedGroup(Number(r.lastInsertRowid), userId)!);
}

export interface GroupPatch { name?: string; timezone?: string | null; layoutId?: number | null }
export function updateGroup(id: number, userId: string, patch: GroupPatch): DisplayGroup | null {
  const g = getOwnedGroup(id, userId);
  if (!g) return null;
  const name = patch.name?.trim() || g.name;
  const timezone = patch.timezone !== undefined ? patch.timezone : g.timezone;
  const layoutId = patch.layoutId !== undefined ? patch.layoutId : g.layout_id;
  db.prepare("UPDATE display_groups SET name = ?, timezone = ?, layout_id = ? WHERE id = ?")
    .run(name, timezone, layoutId, id);
  return summarize(getOwnedGroup(id, userId)!);
}

export function deleteGroup(id: number, userId: string): boolean {
  return db.prepare("DELETE FROM display_groups WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

/** Assign a device to a group (or null). Both must belong to the user. */
export function setDeviceGroup(deviceId: string, groupId: number | null, userId: string): boolean {
  const dev = db.prepare("SELECT user_id FROM devices WHERE id = ?").get(deviceId) as { user_id: string } | undefined;
  if (!dev || dev.user_id !== userId) return false;
  if (groupId !== null && !getOwnedGroup(groupId, userId)) return false;
  db.prepare("UPDATE devices SET group_id = ? WHERE id = ?").run(groupId, deviceId);
  return true;
}

/** Device ids in a group (used to fan out pushes / commands). */
export function deviceIdsInGroup(groupId: number): string[] {
  return (db.prepare("SELECT id FROM devices WHERE group_id = ?").all(groupId) as { id: string }[]).map((r) => r.id);
}

// ---- group schedules (mirrors schedules.ts) ----
export interface GroupSchedule { layoutId: number; enabled: boolean; priority: number; daysMask: number; startMin: number; endMin: number }
interface GroupScheduleRow { layout_id: number; enabled: number; priority: number; days_mask: number; start_min: number; end_min: number }
const clampMask = (m: number): number => Math.max(0, Math.min(127, m | 0));
const clampMin = (m: number, max = 1439): number => Math.max(0, Math.min(max, m | 0));

export function listGroupSchedules(groupId: number): GroupSchedule[] {
  const rows = db.prepare("SELECT * FROM group_schedules WHERE group_id = ? ORDER BY priority DESC, id").all(groupId) as GroupScheduleRow[];
  return rows.map((r) => ({ layoutId: r.layout_id, enabled: r.enabled === 1, priority: r.priority, daysMask: r.days_mask, startMin: r.start_min, endMin: r.end_min }));
}

export function setGroupSchedules(groupId: number, schedules: GroupSchedule[]): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM group_schedules WHERE group_id = ?").run(groupId);
    const ins = db.prepare("INSERT INTO group_schedules (group_id, layout_id, enabled, priority, days_mask, start_min, end_min, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const now = Date.now();
    for (const s of schedules) ins.run(groupId, s.layoutId, s.enabled ? 1 : 0, s.priority | 0, clampMask(s.daysMask), clampMin(s.startMin), clampMin(s.endMin, 1440), now);
  });
  tx();
}

export function hasGroupSchedules(groupId: number): boolean {
  return !!db.prepare("SELECT 1 FROM group_schedules WHERE group_id = ? AND enabled = 1 LIMIT 1").get(groupId);
}

/** The layout a group's schedules dictate right now (highest-priority active window), or null. */
export function activeGroupScheduledLayout(groupId: number, now: number, tz: string | null): number | null {
  const rows = db.prepare("SELECT * FROM group_schedules WHERE group_id = ? AND enabled = 1 ORDER BY priority DESC, id").all(groupId) as GroupScheduleRow[];
  if (!rows.length) return null;
  const { weekday, minute } = wallClock(now, tz);
  for (const r of rows) {
    if (!(r.days_mask & (1 << weekday))) continue;
    if (minute >= r.start_min && minute < r.end_min) return r.layout_id;
  }
  return null;
}
