import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-devov-"));
const { migrate } = await import("./db");
migrate();
const { listOverrides, setOverride, deleteOverride, overridesMap, applyOverrides, clearOverrides } = await import("./deviceOverrides");

describe("#48 per-device overrides", () => {
  it("sets, lists, and maps overrides", () => {
    setOverride("dev1", "blkA", { latitude: 51.5, longitude: -0.12 });
    setOverride("dev1", "blkB", { value: "99" });
    expect(listOverrides("dev1").length).toBe(2);
    expect(overridesMap("dev1").get("blkA")).toEqual({ latitude: 51.5, longitude: -0.12 });
  });

  it("an empty patch deletes the override", () => {
    setOverride("dev1", "blkB", {});
    expect(listOverrides("dev1").find((o) => o.blockId === "blkB")).toBeUndefined();
  });

  it("merges the patch over block props across rows/pages/zones, keeping the rest", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = {
      rows: [{ id: "r", h: 6, blocks: [{ id: "blkA", type: "weather", width: 1, props: { latitude: 28.6, longitude: 77.2, label: "Home" } }] }],
      pages: [[{ id: "p", h: 6, blocks: [{ id: "blkA", type: "weather", width: 1, props: { latitude: 0, longitude: 0 } }] }]],
      zones: [{ rect: { x: 0, y: 0, w: 1, h: 1 }, rows: [{ id: "z", h: 6, blocks: [{ id: "blkA", type: "weather", width: 1, props: { latitude: 0, longitude: 0 } }] }] }],
    };
    const out = applyOverrides(doc, overridesMap("dev1"));
    expect(out.rows[0].blocks[0].props).toEqual({ latitude: 51.5, longitude: -0.12, label: "Home" }); // merged, label kept
    expect(out.pages![0][0].blocks[0].props).toMatchObject({ latitude: 51.5 });
    expect(out.zones![0].rows[0].blocks[0].props).toMatchObject({ latitude: 51.5 });
  });

  it("no overrides for a device → returns the same object", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = { rows: [{ id: "r", h: 6, blocks: [{ id: "x", type: "divider", width: 1, props: {} }] }] };
    expect(applyOverrides(doc, overridesMap("dev-none"))).toBe(doc);
  });

  it("delete + clear", () => {
    setOverride("dev2", "b", { x: 1 });
    expect(deleteOverride("dev2", "b")).toBe(true);
    setOverride("dev2", "b1", { x: 1 });
    setOverride("dev2", "b2", { y: 2 });
    clearOverrides("dev2");
    expect(listOverrides("dev2")).toEqual([]);
  });
});
