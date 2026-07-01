import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-wmetric-"));
const { migrate } = await import("./db");
migrate();
const { resolveWidgetData } = await import("./widgets");
const { logMetric } = await import("./metrics");
const { createUser } = await import("./auth");

// #27 chart half — a metricHistory block resolves to the number series of its dataKey's history.
describe("#27 metricHistory block resolution", () => {
  const user = createUser("Chart", "chart@example.com", "password123")!;
  const board = (props: Record<string, unknown>): LayoutT =>
    ({ schemaVersion: 3, name: "x", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top",
       rows: [{ id: "r", h: 5, blocks: [{ id: "mh", type: "metricHistory", width: 1, props }] }] }) as unknown as LayoutT;

  it("resolves a bound data key to its recorded series (oldest → newest)", async () => {
    const t = Date.now();
    logMetric(user.id, "followers", 100, t - 120_000);
    logMetric(user.id, "followers", 120, t - 60_000);
    logMetric(user.id, "followers", 140, t);
    const data = await resolveWidgetData(board({ dataKey: "followers", label: "Followers", days: 365 }), user.id);
    expect(data["mh"]).toEqual([100, 120, 140]);
  });

  it("an unbound (blank key) block resolves to nothing; an empty key → empty series", async () => {
    const blank = await resolveWidgetData(board({ dataKey: "", label: "", days: 30 }), user.id);
    expect(blank["mh"]).toBeUndefined();
    const missing = await resolveWidgetData(board({ dataKey: "never_logged", label: "", days: 30 }), user.id);
    expect(missing["mh"]).toEqual([]);
  });
});
