import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-geo-"));
const { resolveWidgetData } = await import("./widgets");

// A single astro block (no network) so we can assert the device-geo precedence:
// block geo (if non-default) wins; otherwise the screen's location is injected.
const layoutWith = (props: Record<string, unknown>) =>
  ({ rows: [{ id: "r1", h: 4, blocks: [{ id: "b1", type: "sunriseSunset", width: 1, h: 4, props, style: {} }] }] }) as never;

const DEVICE = { latitude: 51.5, longitude: -0.12 };

describe("resolveWidgetData — per-screen location inheritance", () => {
  it("injects the screen location into an astro block left at the default geo", async () => {
    const data = await resolveWidgetData(layoutWith({ latitude: 28.6139, longitude: 77.209, label: "" }), "u1", undefined, DEVICE);
    expect(data.b1).toEqual({ latitude: 51.5, longitude: -0.12 });
  });

  it("leaves a block that set its own coordinates untouched", async () => {
    const data = await resolveWidgetData(layoutWith({ latitude: 40.7, longitude: -74, label: "" }), "u1", undefined, DEVICE);
    expect(data.b1).toBeUndefined();
  });

  it("does nothing when the screen has no location", async () => {
    const data = await resolveWidgetData(layoutWith({ latitude: 28.6139, longitude: 77.209, label: "" }), "u1");
    expect(data.b1).toBeUndefined();
  });
});
