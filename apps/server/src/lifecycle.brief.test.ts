import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-brief-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
migrate();
const { createUser, setUserDailyBrief, updateUserTimezone } = await import("./auth");
const { runDailyBriefSweep } = await import("./lifecycle");
const { addTask } = await import("./tasks");

// #42 — the emailed daily brief sweep. The send fn is injected so no mail backend (or
// network) is involved; the sweep's window/dedupe/tz decisions are what's under test.
describe("#42 emailed daily brief", () => {
  it("sends inside the 2h window, once per local day, and again the next day", async () => {
    const u = createUser("Brief", "brief@example.com", "password123")!;
    setUserDailyBrief(u.id, 420); // 07:00 (tz unset → UTC)
    const sent: string[] = [];
    const spy = (usr: { email: string }) => { sent.push(usr.email); return Promise.resolve(); };
    const at = (d: number, h: number, m = 0) => Date.UTC(2026, 6, d, h, m);
    await runDailyBriefSweep(at(2, 6, 30), spy); // before the window
    expect(sent.length).toBe(0);
    await runDailyBriefSweep(at(2, 7, 10), spy); // inside → sends
    expect(sent).toEqual(["brief@example.com"]);
    await runDailyBriefSweep(at(2, 7, 40), spy); // still inside, already sent today
    expect(sent.length).toBe(1);
    await runDailyBriefSweep(at(2, 9, 30), spy); // window passed — a down-all-morning server stays quiet
    expect(sent.length).toBe(1);
    await runDailyBriefSweep(at(3, 7, 5), spy); // next local day → sends again
    expect(sent.length).toBe(2);
  });

  it("honors the user's timezone and carries their tasks in the brief", async () => {
    const u = createUser("BriefTz", "brieftz@example.com", "password123")!;
    expect(updateUserTimezone(u.id, "America/New_York")).not.toBeNull(); // UTC-4 in July (EDT)
    setUserDailyBrief(u.id, 420); // 07:00 EDT = 11:00 UTC
    addTask(u.id, "default", "water the plants");
    const briefs: { tasks: string[] }[] = [];
    const spy = (_u: unknown, b: { tasks: string[] }) => { briefs.push(b); return Promise.resolve(); };
    await runDailyBriefSweep(Date.UTC(2026, 6, 2, 7, 5), spy); // 03:05 EDT — hours early
    expect(briefs.length).toBe(0);
    await runDailyBriefSweep(Date.UTC(2026, 6, 2, 11, 15), spy); // 07:15 EDT → sends
    expect(briefs.length).toBe(1);
    expect(briefs[0]!.tasks).toContain("water the plants");
  });

  it("unsubscribed users are never swept", async () => {
    createUser("BriefOff", "briefoff@example.com", "password123");
    const sent: unknown[] = [];
    await runDailyBriefSweep(Date.UTC(2026, 6, 4, 7, 5), (u) => { sent.push(u); return Promise.resolve(); });
    // only the two subscribers above exist; both already got day-4? No — new day, both send.
    // The unsubscribed account must not be among them.
    expect((sent as { email: string }[]).some((s) => s.email === "briefoff@example.com")).toBe(false);
  });
});
