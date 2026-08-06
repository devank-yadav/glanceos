import { describe, expect, it } from "vitest";
import { calendarContext, composeContextualGreeting, composeDailyBrief, type DayCalendar, type DayContext, type DayWeather } from "./daycontext";

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

// #8 — calendar depth: company, host, packing, and real free time, all derived from the
// same parsed agenda (no extra fetch). calendarContext is pure — fixed clock, no throw.
describe("#8 calendar depth (calendarContext)", () => {
  const T0 = Date.parse("2026-06-29T09:00:00Z"); // 09:00 UTC Monday
  const ev = (h: number, mins: number, over: Record<string, unknown> = {}) => ({
    title: `E${h}`, start: new Date(Date.parse(`2026-06-29T${String(h).padStart(2, "0")}:00:00Z`)).toISOString(),
    end: new Date(Date.parse(`2026-06-29T${String(h).padStart(2, "0")}:00:00Z`) + mins * 60_000).toISOString(), ...over,
  });

  it("reads company size and who's hosting off the next event", () => {
    const c = calendarContext([ev(10, 30, { title: "1:1 with Sam", attendees: 2, isOrganizer: true })], T0, TZ);
    expect(c.nextAttendees).toBe(2);
    expect(c.nextIsOneOnOne).toBe(true);
    expect(c.nextIsGroup).toBe(false);
    expect(c.nextIsMine).toBe(true);
  });

  it("three or more people is a group, and a guest isn't hosting", () => {
    const c = calendarContext([ev(10, 30, { attendees: 5 })], T0, TZ);
    expect(c.nextIsGroup).toBe(true);
    expect(c.nextIsOneOnOne).toBe(false);
    expect(c.nextIsMine).toBe(false);
  });

  it("back-to-back = in one now and the next starts within the 5-min seam", () => {
    const tight = calendarContext([ev(8, 65), ev(10, 30)], Date.parse("2026-06-29T08:30:00Z"), TZ); // 08:00–09:05, next 10:00
    expect(tight.backToBack).toBe(false); // a 55-min gap is real breathing room
    const packed = calendarContext([ev(8, 62), ev(9, 30)], Date.parse("2026-06-29T08:30:00Z"), TZ); // ends 09:02, next 09:00
    expect(packed.backToBack).toBe(true);
  });

  it("free time is 0 while busy, the gap when idle, and undefined with nothing ahead", () => {
    expect(calendarContext([ev(8, 120)], T0, TZ).freeForMinutes).toBe(0); // mid-meeting
    expect(calendarContext([ev(11, 30)], T0, TZ).freeForMinutes).toBe(120); // two clear hours
    expect(calendarContext([], T0, TZ).freeForMinutes).toBeUndefined();
  });

  it("all-day events don't consume time: they skip free-time, packing and the up-next list", () => {
    const c = calendarContext([ev(0, 1440, { title: "Conference", allDay: true }), ev(14, 60, { title: "Retro" })], T0, TZ);
    expect(c.freeForMinutes).toBe(300); // 09:00 → 14:00, the all-day banner isn't a booking
    expect(c.meetingMinutesToday).toBe(60);
    expect(c.upcomingTitles).toEqual(["Retro"]);
  });

  it("sums the day's booked minutes and lists the next three", () => {
    const c = calendarContext([ev(10, 30), ev(11, 60), ev(13, 45), ev(15, 30)], T0, TZ);
    expect(c.meetingMinutesToday).toBe(165);
    expect(c.upcomingTitles).toEqual(["E10", "E11", "E13"]);
  });
});
