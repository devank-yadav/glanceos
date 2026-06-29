import { describe, expect, it } from "vitest";
import { composeContextualGreeting, composeDailyBrief, type DayCalendar, type DayContext, type DayWeather } from "./daycontext";

const TZ = "UTC";
const morning = Date.parse("2026-06-29T08:00:00Z"); // 08:00 UTC, a Monday

describe("composeContextualGreeting (#154)", () => {
  it("leads with a time-of-day greeting + meeting count + next-event hint", () => {
    const cal: DayCalendar = { isBusyNow: false, eventsToday: 3, minutesUntilNext: 45, nextTitle: "Standup", nextIsOnline: false, nextIsAllDay: false };
    const line = composeContextualGreeting(cal, undefined, TZ, 200, morning);
    expect(line).toContain("Good morning");
    expect(line).toContain("3 meetings today");
    expect(line).toContain("next in 45m");
  });

  it("says when you're free again while busy, and omits the next-in hint", () => {
    const cal: DayCalendar = { isBusyNow: true, eventsToday: 2, freeUntil: "2026-06-29T09:30:00Z", nextIsOnline: false, nextIsAllDay: false };
    const line = composeContextualGreeting(cal, undefined, TZ, 200, morning);
    expect(line).toContain("free at");
    expect(line).not.toContain("next in");
  });

  it("appends a weather phrase and truncates to maxLen with an ellipsis", () => {
    const w: DayWeather = { tempC: 17.6, summary: "Light rain", precipProbPct: 80, isRaining: true };
    const line = composeContextualGreeting(undefined, w, TZ, 200, morning);
    expect(line).toContain("18°");
    expect(line.toLowerCase()).toContain("light rain");
    const short = composeContextualGreeting(undefined, w, TZ, 14, morning);
    expect(short.length).toBeLessThanOrEqual(14);
    expect(short.endsWith("…")).toBe(true);
  });

  it("handles no calendar and no weather (just the greeting)", () => {
    expect(composeContextualGreeting(undefined, undefined, TZ, 200, morning)).toBe("Good morning");
  });
});

describe("composeDailyBrief (#148)", () => {
  const ev = (h: number, m: number, title: string, location?: string) => {
    const start = Date.parse(`2026-06-29T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
    return { start, end: start + 3_600_000, title, location, allDay: false };
  };
  const ctx: DayContext = {
    tz: TZ,
    weather: { tempC: 17, summary: "Sunny", precipProbPct: 0, isRaining: false },
    calendar: undefined,
    events: [ev(7, 0, "Past"), ev(9, 0, "Standup", "Room 3"), ev(12, 30, "Lunch"), ev(16, 0, "Review"), ev(18, 0, "Gym")],
  };

  it("shows only future-today events, capped to maxEvents, time-formatted", () => {
    const b = composeDailyBrief(ctx, [], { maxEvents: 2, maxTasks: 2, showWeather: true, showDate: true }, morning);
    expect(b.greeting).toBe("Good morning");
    expect(b.dateLabel).toContain("June");
    expect(b.weatherLine?.toLowerCase()).toContain("sunny");
    expect(b.events.length).toBe(2);              // 7:00 already ended → excluded; capped at 2
    expect(b.events[0]!.title).toBe("Standup");
    expect(b.events[0]!.time).toMatch(/9/);
  });

  it("keeps an all-day event visible all day even though its default end is 1h after midnight", () => {
    const allDayStart = Date.parse("2026-06-29T00:00:00Z");
    const ctxAllDay: DayContext = { tz: TZ, weather: undefined, calendar: undefined, events: [{ start: allDayStart, end: allDayStart + 3_600_000, title: "Holiday", allDay: true }] };
    const b = composeDailyBrief(ctxAllDay, [], { maxEvents: 3, maxTasks: 0, showWeather: false, showDate: false }, morning);
    expect(b.events.length).toBe(1);
    expect(b.events[0]!.title).toBe("Holiday");
    expect(b.events[0]!.time).toBe("All day");
  });

  it("lists undone tasks capped to maxTasks, omitting done ones, and honors toggles", () => {
    const b = composeDailyBrief(
      ctx,
      [{ text: "A", done: false }, { text: "B", done: true }, { text: "C", done: false }, { text: "D", done: false }],
      { maxEvents: 0, maxTasks: 2, showWeather: false, showDate: false },
      morning,
    );
    expect(b.tasks).toEqual(["A", "C"]);
    expect(b.weatherLine).toBeNull();
    expect(b.dateLabel).toBe("");
    expect(b.events.length).toBe(0);
  });
});
