import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-schedsig-"));
const { migrate } = await import("./db");
migrate();
const { scheduledSig } = await import("./state");

// #80 — scheduledSig fingerprints which scheduled blocks are active right now, so the e-ink
// /display ETag busts at a schedule boundary (a screen-side flip leaves version+data unchanged).
type Sched = { startMin?: number; endMin?: number; daysMask?: number; fromDate?: string; toDate?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mk = (schedule?: Sched): any => ({
  schemaVersion: 3,
  name: "x",
  rows: [{ id: "r", blocks: [{ id: "a", type: "text", props: {}, ...(schedule ? { schedule } : {}) }] }],
});

describe("#80 scheduledSig (e-ink ETag schedule fingerprint)", () => {
  it("is empty when the board has no scheduled blocks", () => {
    expect(scheduledSig(mk(undefined))).toBe("");
  });

  it("reflects active vs inactive at a given time", () => {
    const at8 = new Date(2026, 0, 1, 8, 0); // 08:00 local
    expect(scheduledSig(mk({ startMin: 360, endMin: 540 }), at8)).toBe("a:1"); // 06:00–09:00 → active
    expect(scheduledSig(mk({ startMin: 600, endMin: 720 }), at8)).toBe("a:0"); // 10:00–12:00 → inactive
  });

  it("gates by weekday and by date range", () => {
    const d = new Date(2026, 0, 1, 8, 0);
    expect(scheduledSig(mk({ daysMask: 1 << d.getDay() }), d)).toBe("a:1"); // today's bit
    expect(scheduledSig(mk({ daysMask: 1 << ((d.getDay() + 1) % 7) }), d)).toBe("a:0"); // a different day
    expect(scheduledSig(mk({ fromDate: "2025-12-24", toDate: "2025-12-26" }), d)).toBe("a:0"); // window already past
  });
});
