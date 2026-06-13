import type { CalendarDataT, CalendarEventT } from "@glanceos/schema";
import * as rruleLib from "rrule";

// rrule ships a CJS main and an ESM module build. Node (tsx) loads the CJS one,
// where named exports aren't statically detectable; Vite/vitest load the ESM one.
const { RRule } = ((rruleLib as { default?: typeof rruleLib }).default ?? rruleLib) as typeof rruleLib;

// Minimal ICS (RFC 5545) parsing: unfold lines, walk VEVENTs, read
// DTSTART/DTEND/SUMMARY/RRULE. Recurrence is expanded with the rrule package —
// a deliberate buy-not-build (DECISIONS 017). Known v0.1 gap, on purpose:
// TZID values are treated as server-local time (P4 work).

const TTL_MS = 5 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
const PARSE_CAP = 50;
const WINDOW_MS = 14 * 24 * 3600 * 1000;
const cache = new Map<string, { at: number; data: CalendarDataT }>();

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
}

function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, zulu] = m;
  const allDay = hh === undefined;
  const date = zulu
    ? new Date(Date.UTC(+y!, +mo! - 1, +d!, +(hh ?? "0"), +(mm ?? "0"), +(ss ?? "0")))
    : new Date(+y!, +mo! - 1, +d!, +(hh ?? "0"), +(mm ?? "0"), +(ss ?? "0"));
  return { date, allDay };
}

interface PendingEvent {
  start?: Date;
  end?: Date;
  title?: string;
  allDay?: boolean;
  rrule?: string;
}

function emitEvent(events: CalendarEventT[], e: PendingEvent, windowStart: number, windowEnd: number): void {
  if (!e.start || !e.title) return;
  const durationMs = e.end ? e.end.getTime() - e.start.getTime() : 3600 * 1000;

  if (e.rrule) {
    try {
      const rule = new RRule({ ...RRule.parseString(e.rrule), dtstart: e.start });
      for (const occurrence of rule.between(new Date(windowStart), new Date(windowEnd), true).slice(0, 20)) {
        events.push({
          start: occurrence.toISOString(),
          end: new Date(occurrence.getTime() + durationMs).toISOString(),
          title: e.title,
          allDay: e.allDay ?? false,
        });
      }
      return;
    } catch {
      // unparseable rule — fall through and show the first instance at least
    }
  }
  events.push({
    start: e.start.toISOString(),
    end: e.end?.toISOString(),
    title: e.title,
    allDay: e.allDay ?? false,
  });
}

export function parseIcs(text: string, now = Date.now()): CalendarEventT[] {
  const windowStart = now - 3600 * 1000; // still-running events count
  const windowEnd = now + WINDOW_MS;
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/); // unfold, then split
  const events: CalendarEventT[] = [];
  let current: PendingEvent | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) emitEvent(events, current, windowStart, windowEnd);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).split(";")[0];
    const value = line.slice(colon + 1);
    if (key === "DTSTART") {
      const p = parseIcsDate(value);
      if (p) {
        current.start = p.date;
        current.allDay = p.allDay;
      }
    } else if (key === "DTEND") {
      const p = parseIcsDate(value);
      if (p) current.end = p.date;
    } else if (key === "SUMMARY") {
      current.title = unescapeText(value);
    } else if (key === "RRULE") {
      current.rrule = value;
    }
  }

  return events
    .filter((e) => {
      const end = e.end ? Date.parse(e.end) : Date.parse(e.start) + 3600 * 1000;
      return end >= now && Date.parse(e.start) <= windowEnd;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, PARSE_CAP);
}

export async function calendarData(props: { url: string; maxEvents: number }): Promise<CalendarDataT> {
  const hit = cache.get(props.url);
  if (hit && Date.now() - hit.at < (hit.data.error ? FAIL_TTL_MS : TTL_MS)) {
    return { events: hit.data.events.slice(0, props.maxEvents), error: hit.data.error };
  }

  let data: CalendarDataT;
  try {
    const res = await fetch(props.url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = { events: parseIcs(await res.text()) };
  } catch {
    data = { events: hit?.data.events ?? [], error: "calendar unreachable" };
  }
  cache.set(props.url, { at: Date.now(), data });
  return { events: data.events.slice(0, props.maxEvents), error: data.error };
}
