import { db } from "./db";

// Time-of-day / day-of-week schedules per device. The active layout is chosen
// from the device's wall clock (its IANA timezone, else server local) so SSE
// browsers and polled e-ink devices agree without coordination — same spirit as
// (board pages handle in-board rotation). Highest priority wins on overlap.

export interface Schedule {
  id?: number;
  layoutId: number;
  layoutName?: string;
  enabled: boolean;
  priority: number;
  daysMask: number; // bit 0 = Sunday … bit 6 = Saturday
  startMin: number; // minutes since local midnight [0..1439]
  endMin: number; // [1..1440]
}

interface ScheduleRow {
  id: number; device_id: string; layout_id: number; enabled: number;
  priority: number; days_mask: number; start_min: number; end_min: number;
  layout_name?: string | null;
}

const clampMin = (v: number, max = 1439) => Math.max(0, Math.min(max, Math.round(v || 0)));
const clampMask = (v: number) => Math.max(0, Math.min(127, v | 0));

function toSchedule(r: ScheduleRow): Schedule {
  return {
    id: r.id, layoutId: r.layout_id, layoutName: r.layout_name ?? undefined,
    enabled: r.enabled === 1, priority: r.priority, daysMask: r.days_mask,
    startMin: r.start_min, endMin: r.end_min,
  };
}

export function listSchedules(deviceId: string): Schedule[] {
  const rows = db.prepare(
    `SELECT s.*, l.name AS layout_name FROM schedules s
     LEFT JOIN layouts l ON l.id = s.layout_id
     WHERE s.device_id = ? ORDER BY s.priority DESC, s.id`,
  ).all(deviceId) as ScheduleRow[];
  return rows.map(toSchedule);
}

/** Replace all schedules for a device (caller verifies ownership). */
export function setSchedules(deviceId: string, schedules: Schedule[]): void {
  const ins = db.prepare(
    "INSERT INTO schedules (device_id, layout_id, enabled, priority, days_mask, start_min, end_min, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM schedules WHERE device_id = ?").run(deviceId);
    const now = Date.now();
    for (const s of schedules) {
      if (!Number.isInteger(s.layoutId)) continue;
      ins.run(deviceId, s.layoutId, s.enabled ? 1 : 0, s.priority | 0, clampMask(s.daysMask), clampMin(s.startMin), clampMin(s.endMin, 1440), now);
    }
  });
  tx();
}

export function hasSchedules(deviceId: string): boolean {
  return !!db.prepare("SELECT 1 FROM schedules WHERE device_id = ? AND enabled = 1 LIMIT 1").get(deviceId);
}

/** Minute-of-day + weekday (0=Sun) for an instant in an IANA tz (null = server local). */
export function wallClock(now: number, tz: string | null): { weekday: number; minute: number } {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false };
  if (tz) opts.timeZone = tz;
  let weekday: number, minute: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(new Date(now));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour = Number(get("hour")) % 24; // some ICU builds render midnight as "24"
    minute = hour * 60 + Number(get("minute"));
    weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[get("weekday")] ?? new Date(now).getDay();
  } catch {
    const d = new Date(now); // bad tz → server local
    weekday = d.getDay();
    minute = d.getHours() * 60 + d.getMinutes();
  }
  return { weekday, minute };
}

/** The layout this device's schedules dictate right now (highest priority active window), or null. */
export function activeScheduledLayout(deviceId: string, now: number, tz: string | null): number | null {
  const rows = db.prepare("SELECT * FROM schedules WHERE device_id = ? AND enabled = 1 ORDER BY priority DESC, id").all(deviceId) as ScheduleRow[];
  if (rows.length === 0) return null;
  const { weekday, minute } = wallClock(now, tz);
  for (const r of rows) {
    if (!(r.days_mask & (1 << weekday))) continue;
    if (minute >= r.start_min && minute < r.end_min) return r.layout_id;
  }
  return null;
}
