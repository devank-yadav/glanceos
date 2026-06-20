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

describe("customData renderer", () => {
  const cd = (id: string, props: object) => ({ id, type: "customData", width: 1, props });
  const render = (data: Record<string, unknown>) =>
    renderPayload({ claimed: true, state: { layoutVersion: 1, data, layout: {
      ...baseLayout,
      rows: [{ id: "r1", h: 6, blocks: [
        cd("num", { key: "n", label: "Lobby", format: "number" }),
        cd("json", { key: "s", label: "Status", format: "json" }),
        cd("unset", { key: "u", label: "Unset", format: "text" }),
      ] }],
    } } } as unknown as StreamPayloadT);

  it("formats numbers, pretty-prints JSON, and shows a placeholder for unset keys", () => {
    render({ num: { value: 1280 }, json: { value: { open: true, staff: 4 } }, unset: { error: "no data" } });
    expect((document.querySelector(".custom-value") as HTMLElement).textContent).toBe((1280).toLocaleString());
    expect((document.querySelector(".custom-json") as HTMLElement).textContent).toContain('"open": true');
    expect([...document.querySelectorAll(".placeholder")].some((p) => p.textContent === "no data")).toBe(true);
  });

  it("never injects markup from a value (textContent only)", () => {
    render({ num: { value: "<img src=x onerror=alert(1)>" }, json: { value: 1 }, unset: { value: 1 } });
    expect(document.querySelector("img")).toBeNull();
    expect((document.querySelector(".custom-value") as HTMLElement).textContent).toContain("<img");
  });
});
