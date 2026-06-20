import { describe, expect, it } from "vitest";
import type { StreamPayloadT } from "@glanceos/schema";

// renderPayload captures #app at module load, so it must exist before importing.
document.body.innerHTML = '<div id="app"></div>';
const { renderPayload } = await import("./render");

const row = { id: "r1", h: 6, blocks: [{ id: "b1", type: "divider", width: 1, props: {} }] };
const baseLayout = { schemaVersion: 3, name: "Z", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top" };
const payload = (layout: object): StreamPayloadT =>
  ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;

describe("renderPayload zones", () => {
  it("emits one positioned .zone per zone, each with its own page", () => {
    renderPayload(payload({
      ...baseLayout,
      rows: [],
      zones: [
        { id: "z1", rect: { x: 0, y: 0, w: 50, h: 100 }, rows: [row] },
        { id: "z2", rect: { x: 50, y: 0, w: 50, h: 100 }, rows: [row] },
      ],
    }));
    const zones = document.querySelectorAll(".page-zones .zone");
    expect(zones.length).toBe(2);
    expect((zones[1] as HTMLElement).style.left).toBe("50%");
    expect((zones[1] as HTMLElement).style.width).toBe("50%");
    expect(document.querySelectorAll(".zone .page .board-row").length).toBe(2);
  });

  it("renders a single full-screen page when there are no zones", () => {
    renderPayload(payload({ ...baseLayout, rows: [row] }));
    expect(document.querySelectorAll(".page-zones").length).toBe(0);
    expect(document.querySelectorAll("#app > .page").length).toBe(1);
    expect(document.querySelectorAll("#app > .page > .board-row").length).toBe(1);
  });
});
