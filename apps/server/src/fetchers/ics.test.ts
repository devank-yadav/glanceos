import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";

const NOW = new Date(2026, 0, 15, 12, 0, 0); // local time, like un-zoned ICS values

function ics(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function daysFromNow(days: number, hour = 10): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function vevent(lines: string[]): string {
  return ["BEGIN:VCALENDAR", "BEGIN:VEVENT", ...lines, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

describe("parseIcs", () => {
  it("keeps upcoming events, drops past ones, sorts ascending", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      `DTSTART:${ics(daysFromNow(3))}`,
      "SUMMARY:Later",
      "END:VEVENT",
      "BEGIN:VEVENT",
      `DTSTART:${ics(daysFromNow(-7))}`,
      "SUMMARY:Last week",
      "END:VEVENT",
      "BEGIN:VEVENT",
      `DTSTART:${ics(daysFromNow(1))}`,
      "SUMMARY:Sooner",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcs(text, NOW.getTime());
    expect(events.map((e) => e.title)).toEqual(["Sooner", "Later"]);
  });

  it("unfolds folded lines and unescapes text", () => {
    const text = vevent([
      `DTSTART:${ics(daysFromNow(1))}`,
      "SUMMARY:Lunch\\, then study;\r\n  continued on a folded line",
    ]);
    const events = parseIcs(text, NOW.getTime());
    expect(events[0]!.title).toBe("Lunch, then study; continued on a folded line");
  });

  it("flags all-day events", () => {
    const d = daysFromNow(2);
    const p = (n: number) => String(n).padStart(2, "0");
    const text = vevent([
      `DTSTART;VALUE=DATE:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`,
      "SUMMARY:Holiday",
    ]);
    const events = parseIcs(text, NOW.getTime());
    expect(events[0]!.allDay).toBe(true);
  });

  it("expands weekly recurrence inside the 14-day window", () => {
    const text = vevent([
      `DTSTART:${ics(daysFromNow(1))}`,
      `DTEND:${ics(daysFromNow(1, 11))}`,
      "RRULE:FREQ=WEEKLY",
      "SUMMARY:Class",
    ]);
    const events = parseIcs(text, NOW.getTime());
    expect(events).toHaveLength(2); // day 1 and day 8 fall in the window; day 15 doesn't
    expect(events.every((e) => e.title === "Class")).toBe(true);
    const gapDays = (Date.parse(events[1]!.start) - Date.parse(events[0]!.start)) / 86_400_000;
    expect(gapDays).toBe(7);
  });

  it("ignores events without DTSTART or SUMMARY", () => {
    const text = vevent(["SUMMARY:No date"]);
    expect(parseIcs(text, NOW.getTime())).toHaveLength(0);
  });
});
