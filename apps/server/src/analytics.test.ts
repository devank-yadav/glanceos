import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-analytics-"));
const { db, migrate } = await import("./db");
migrate();
const { track, funnelCounts, dauWau, retentionD1D7 } = await import("./analytics");

const DAY = 86_400_000;
const insert = (userId: string, name: string, at: number) =>
  db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (?, ?, '{}', ?)").run(userId, name, at);

describe("track()", () => {
  it("inserts an event row with props and never throws", () => {
    track("signup", { userId: "u-track", orgId: "o1", props: { plan: "free" } });
    const row = db.prepare("SELECT * FROM events WHERE user_id = 'u-track'").get() as { name: string; org_id: string; props: string };
    expect(row.name).toBe("signup");
    expect(row.org_id).toBe("o1");
    expect(JSON.parse(row.props).plan).toBe("free");
  });
});

describe("funnelCounts()", () => {
  it("counts DISTINCT users per event name; unknown names are 0", () => {
    insert("a", "screen_claimed", Date.now());
    insert("a", "screen_claimed", Date.now()); // same user twice → counts once
    insert("b", "screen_claimed", Date.now());
    const c = funnelCounts(["screen_claimed", "never_happened"]);
    expect(c.screen_claimed).toBe(2);
    expect(c.never_happened).toBe(0);
  });
});

// Anchor the windowed queries far in the future so rows the earlier blocks inserted
// at real Date.now() fall outside every window and can't contaminate the counts.
const T0 = Date.now() + 1000 * DAY;

describe("dauWau()", () => {
  it("counts distinct active users in the last day / week", () => {
    insert("d1", "x", T0 - 1000); // within the day
    insert("d2", "x", T0 - 3 * DAY); // within the week, not the day
    insert("d3", "x", T0 - 30 * DAY); // outside both
    const { dau, wau } = dauWau(T0);
    expect(dau).toBe(1);
    expect(wau).toBe(2);
  });
});

describe("retentionD1D7()", () => {
  it("measures the signup-day cohort returning on D1 and D7", () => {
    const cohort = T0 + 500 * DAY; // a fresh region, no prior rows
    insert("r1", "signup", cohort + 3_600_000); // first event in the cohort day
    insert("r1", "x", cohort + DAY + 3_600_000); // returns in the D1 window
    insert("r1", "x", cohort + 7 * DAY + 3_600_000); // returns in the D7 window
    insert("r2", "signup", cohort + 7_200_000); // in cohort, never returns
    insert("r3", "signup", cohort - 5 * DAY); // first event before the cohort day → excluded

    const r = retentionD1D7(cohort);
    expect(r.cohort).toBe(2); // r1, r2 (not r3)
    expect(r.d1.returned).toBe(1);
    expect(r.d7.returned).toBe(1);
    expect(r.d1.rate).toBeCloseTo(0.5);
  });
});
