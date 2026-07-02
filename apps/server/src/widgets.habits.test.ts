import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-whabits-"));
const { migrate } = await import("./db");
migrate();
const { resolveWidgetData } = await import("./widgets");
const { logMetric } = await import("./metrics");
const { createUser } = await import("./auth");

// #74 — habit-bound blocks resolve to the REAL history of habit.<name> (display-only).
describe("#74 live habit blocks", () => {
  const user = createUser("Habit", "habit74@example.com", "password123")!; // no tz → UTC day math
  const board = (habit: string): LayoutT =>
    ({ schemaVersion: 3, name: "h", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top",
       rows: [{ id: "r", h: 4, blocks: [
         { id: "st", type: "streak", width: 1, props: { value: 42, label: "day streak", habit } },
         { id: "wk", type: "habitTracker", width: 1, props: { label: "This week", days: ". . . . . . .", habit } },
         { id: "mo", type: "monthHabit", width: 1, props: { label: "This month", days: ".", habit } },
       ] }] }) as unknown as LayoutT;

  it("a 3-day run ending today resolves streak=3 and marks today in the grids", async () => {
    const now = Date.now();
    for (const d of [0, 1, 2]) logMetric(user.id, "habit.walk", 1, now - d * 86_400_000);
    const data = await resolveWidgetData(board("walk"), user.id);
    expect(data["st"]).toEqual({ value: 3 });
    const week = (data["wk"] as { days: string }).days.split(" ");
    expect(week).toHaveLength(7);
    const todayIdx = (new Date().getUTCDay() + 6) % 7; // Monday-start index of today (UTC user)
    expect(week[todayIdx]).toBe("x"); // today is marked
    const month = (data["mo"] as { days: string }).days.split(" ");
    expect(month[new Date().getUTCDate() - 1]).toBe("x"); // today's dot in the month grid
  });

  it("an unbound block resolves nothing (static props, unchanged behavior)", async () => {
    const data = await resolveWidgetData(board(""), user.id);
    expect(data["st"]).toBeUndefined();
    expect(data["wk"]).toBeUndefined();
  });
});
