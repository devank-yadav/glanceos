import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamPayloadT } from "@glanceos/schema";

// renderPayload captures #app at module load, so it must exist before importing.
document.body.innerHTML = '<div id="app"></div>';
const { renderPayload } = await import("./render");
const { showAlert } = await import("./alert");

const row = { id: "r1", h: 6, blocks: [{ id: "b1", type: "divider", width: 1, props: {} }] };
const baseLayout = { schemaVersion: 3, name: "Z", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top" };
const payload = (layout: object): StreamPayloadT =>
  ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;

// v6.1 the renderer keeps the DOM across same-shaped ticks (calm crossfade) + carries
// module state (cells / mountedSig). Reset it between tests so each is independent —
// render a claimed-no-layout payload, which routes through renderMessage()→reset().
beforeEach(() => renderPayload({ claimed: true, state: { layoutVersion: 0, layout: null, data: {} } } as StreamPayloadT));

describe("calm crossfade — in-place diff (v6.1)", () => {
  const mk = (n: number): StreamPayloadT => ({
    claimed: true,
    state: { layoutVersion: 1, data: { live: n }, layout: { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
      { id: "keep", type: "heading", width: 1, props: { content: "Hi", level: 1 } },
      { id: "live", type: "customData", width: 1, props: { key: "live", label: "" } },
    ] }] } },
  } as unknown as StreamPayloadT);

  it("keeps an unchanged cell (same node, no fade) and re-renders only the changed one", () => {
    renderPayload(mk(1));
    const keep1 = document.querySelector(".widget-heading")!;
    const live1 = document.querySelector(".widget-customData")!;
    renderPayload(mk(2)); // same skeleton, only data.live changed
    expect(document.querySelector(".widget-heading")).toBe(keep1); // unchanged → same DOM node, never rebuilt
    expect(keep1.classList.contains("swap")).toBe(false);
    expect(document.querySelector(".widget-customData")).toBe(live1); // updated in place, not replaced
    expect(live1.classList.contains("swap")).toBe(true); // changed → faded
  });
});

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

  it("defaults a width-less block to flex-grow 1 (compact docs posted into preview must still fill)", () => {
    // a doc with no `width` on the block — the runtime is zod-free, so nothing
    // fills the default; the renderer must, or the block collapses to min-content.
    renderPayload(payload({ ...baseLayout, rows: [{ id: "r1", h: 6, blocks: [{ id: "b1", type: "divider", props: {} }] }] }));
    const cell = document.querySelector("#app > .page > .board-row > .widget") as HTMLElement;
    expect(cell).not.toBeNull();
    expect(cell.style.flexGrow).toBe("1");
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

describe("live alert banner", () => {
  it("appends to <body> (outside #app), survives a state re-render, then auto-removes", () => {
    vi.useFakeTimers();
    try {
      showAlert({ severity: "warn", title: "Lobby full", body: "occupancy > 50", ttl: 5 });
      const el = document.getElementById("glance-alert")!;
      expect(el.parentElement).toBe(document.body); // NOT inside #app
      expect(el.className).toContain("sev-warn");
      expect(el.querySelector(".ga-title")!.textContent).toBe("Lobby full");
      // a state push wipes #app — the banner must persist
      renderPayload(payload({ ...baseLayout, rows: [row] }));
      expect(document.getElementById("glance-alert")).not.toBeNull();
      vi.advanceTimersByTime(5000);
      expect(document.getElementById("glance-alert")).toBeNull(); // gone after ttl
    } finally { vi.useRealTimers(); }
  });

  it("renders the title via textContent — never markup", () => {
    showAlert({ title: "<img src=x onerror=alert(1)>" });
    expect(document.querySelector("#glance-alert img")).toBeNull();
    expect(document.querySelector("#glance-alert .ga-title")!.textContent).toContain("<img");
    document.getElementById("glance-alert")?.remove();
  });
});

describe("pomodoro is a live, self-running timer", () => {
  const pomo = (props: object) =>
    renderPayload(payload({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
      { id: "p", type: "pomodoro", width: 1, props },
    ] }] }) as StreamPayloadT);

  it("shows Focus + remaining anchored to midnight, and ticks down on its own", () => {
    vi.useFakeTimers();
    try {
      // 25/5 → a 30-minute cycle. 10 min past local midnight → 15:00 left of Focus.
      vi.setSystemTime(new Date(2026, 5, 21, 0, 10, 0));
      pomo({ workMin: 25, breakMin: 5, label: "" });
      expect(document.querySelector(".pomo-phase")!.textContent).toBe("Focus");
      expect(document.querySelector(".pomo-time")!.textContent).toBe("15:00");
      // self-updating: one minute later it reads 14:00 with no re-render
      vi.advanceTimersByTime(60_000);
      expect(document.querySelector(".pomo-time")!.textContent).toBe("14:00");
    } finally { vi.useRealTimers(); }
  });

  it("flips to Break inside the break window", () => {
    vi.useFakeTimers();
    try {
      // 26 min in → 1 min into the 5-min break → 4:00 left.
      vi.setSystemTime(new Date(2026, 5, 21, 0, 26, 0));
      pomo({ workMin: 25, breakMin: 5, label: "" });
      expect(document.querySelector(".pomo-phase")!.textContent).toBe("Break");
      expect(document.querySelector(".pomo-phase")!.className).toContain("rest");
      expect(document.querySelector(".pomo-time")!.textContent).toBe("4:00");
    } finally { vi.useRealTimers(); }
  });
});

describe("new self-running objects", () => {
  const one = (block: object) =>
    renderPayload(payload({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [block] }] }) as StreamPayloadT);

  it("onAir flips ON/OFF from its time window", () => {
    vi.useFakeTimers();
    try {
      const blk = { id: "a", type: "onAir", width: 1, props: { label: "", start: 9, end: 17, onText: "ON AIR", offText: "OFF AIR" } };
      vi.setSystemTime(new Date(2026, 5, 21, 10, 0, 0)); // inside the window
      one(blk);
      expect(document.querySelector(".openbig")!.textContent).toBe("ON AIR");
      expect(document.querySelector(".openbig")!.className).toContain("on-air");
      // self-updating: it flips on its own interval (no re-render) once we're past the window.
      vi.setSystemTime(new Date(2026, 5, 21, 20, 0, 0)); // outside
      vi.advanceTimersByTime(60_000);
      expect(document.querySelector(".openbig")!.textContent).toBe("OFF AIR");
    } finally { vi.useRealTimers(); }
  });

  it("nextFullMoon counts down — ~15 days from a new moon", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.UTC(2000, 0, 6, 18, 14, 0))); // a reference new moon → half a cycle to full
      one({ id: "m", type: "nextFullMoon", width: 1, props: { label: "" } });
      expect(document.querySelector(".stat-value")!.textContent).toBe("15");
      expect(document.querySelector(".stat-label")!.textContent).toContain("to full moon");
    } finally { vi.useRealTimers(); }
  });
});

describe("upNext agenda object", () => {
  const upn = (props: object) =>
    renderPayload(payload({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [{ id: "u", type: "upNext", width: 1, props }] }] }) as StreamPayloadT);

  it("shows the next event + countdown + location from typed items", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 22, 8, 50, 0)); // 10 min before the 09:00 standup
      upn({ label: "", items: "09:00 | Standup | Room 3\n12:30 | Lunch" });
      expect(document.querySelector(".upnext-title")!.textContent).toBe("Standup");
      expect(document.querySelector(".upnext-meta")!.textContent).toBe("in 10 min · Room 3");
    } finally { vi.useRealTimers(); }
  });

  it("prefers a bound calendar source over typed items", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 22, 8, 50, 0));
      renderPayload({ claimed: true, state: { layoutVersion: 1, data: { u: { events: [{ start: new Date(2026, 5, 22, 9, 30, 0).toISOString(), title: "Dentist", location: "Clinic" }] } }, layout: {
        ...baseLayout, rows: [{ id: "r", h: 6, blocks: [{ id: "u", type: "upNext", width: 1, props: { label: "", items: "09:00 | Standup" } }] }],
      } } } as unknown as StreamPayloadT);
      expect(document.querySelector(".upnext-title")!.textContent).toBe("Dentist"); // live wins
      expect(document.querySelector(".upnext-meta")!.textContent).toBe("in 40 min · Clinic");
    } finally { vi.useRealTimers(); }
  });
});

describe("ambient / self objects", () => {
  it("myDay greets by time of day and shows bound weather", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 22, 8, 0, 0));
      renderPayload({ claimed: true, state: { layoutVersion: 1, data: { d: { temperatureC: 19, summary: "rain" } }, layout: {
        ...baseLayout, rows: [{ id: "r", h: 7, blocks: [{ id: "d", type: "myDay", width: 1, props: { name: "Devank", subtitle: "x", showDate: true } }] }],
      } } } as unknown as StreamPayloadT);
      expect(document.querySelector(".myday-greet")!.textContent).toBe("Good morning, Devank");
      expect(document.querySelector(".myday-wx")!.textContent).toBe("19° · rain");
    } finally { vi.useRealTimers(); }
  });

  it("healthRing shows the value (bound or typed) abbreviated", () => {
    renderPayload(payload({ ...baseLayout, rows: [{ id: "r", h: 8, blocks: [{ id: "h", type: "healthRing", width: 1, props: { label: "Steps", value: 6200, goal: 10000, unit: "" } }] }] }) as StreamPayloadT);
    expect(document.querySelector(".ring-value")!.textContent).toBe("6.2k");
  });
});

describe("signage blocks bind to live data with a static fallback", () => {
  const sensor = (data: Record<string, unknown>) =>
    renderPayload({ claimed: true, state: { layoutVersion: 1, data, layout: {
      ...baseLayout,
      rows: [{ id: "r", h: 6, blocks: [{ id: "s", type: "sensor", width: 1, props: { label: "Room", value: "21", unit: "°C" } }] }],
    } } } as unknown as StreamPayloadT);

  it("shows the typed prop when unbound, the live value when data arrives", () => {
    sensor({}); // no data → the offline fallback
    expect(document.querySelector(".metric-value")!.textContent).toBe("21");
    sensor({ s: { value: 42.5 } }); // bound → the resolved value
    expect(document.querySelector(".metric-value")!.textContent).toBe("42.5");
  });
});
