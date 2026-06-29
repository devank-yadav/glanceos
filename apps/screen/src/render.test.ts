import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamPayloadT } from "@glanceos/schema";

// renderPayload captures #app at module load, so it must exist before importing.
document.body.innerHTML = '<div id="app"></div>';
const { renderPayload, activePageIndex, activePageAt, pageScheduleActive } = await import("./render");
const { showAlert } = await import("./alert");
// Same object reference render.ts holds — register a deliberately-throwing widget so we
// can prove one bad block can't blank the wall (render-isolation, v7.0 P0).
const { WIDGETS } = await import("./widgets");
(WIDGETS as Record<string, unknown>).__throw = () => { throw new Error("boom"); };
const { createEditLayer } = await import("./edit");

const row = { id: "r1", h: 6, blocks: [{ id: "b1", type: "divider", width: 1, props: {} }] };
const baseLayout = { schemaVersion: 3, name: "Z", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top" };
const payload = (layout: object): StreamPayloadT =>
  ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;

// v6.1 the renderer keeps the DOM across same-shaped ticks (calm crossfade) + carries
// module state (cells / mountedSig). Reset it between tests so each is independent —
// render a claimed-no-layout payload, which routes through renderMessage()→reset().
beforeEach(() => renderPayload({ claimed: true, state: { layoutVersion: 0, layout: null, data: {} } } as StreamPayloadT));

describe("activePageAt — rich page rotation (v10)", () => {
  it("degrades to equal-duration rotation with no per-page settings", () => {
    expect(activePageAt(0, 3, undefined, 10)).toBe(0); // 3 pages × 10s, cycle 30s
    expect(activePageAt(12_000, 3, undefined, 10)).toBe(1);
    expect(activePageAt(25_000, 3, undefined, 10)).toBe(2);
    expect(activePageAt(30_000, 3, undefined, 10)).toBe(0); // wraps
    expect(activePageAt(0, 1, undefined, 10)).toBe(0); // single page → static
  });
  it("honors per-page dwell durations (variable cycle)", () => {
    const s = [{ seconds: 30 }, { seconds: 10 }]; // cycle 40s; page0 [0,30), page1 [30,40)
    expect(activePageAt(5_000, 2, s, 10)).toBe(0);
    expect(activePageAt(29_000, 2, s, 10)).toBe(0);
    expect(activePageAt(30_000, 2, s, 10)).toBe(1);
    expect(activePageAt(39_000, 2, s, 10)).toBe(1);
    expect(activePageAt(40_000, 2, s, 10)).toBe(0); // wraps
  });
  it("skips out-of-schedule pages and never blanks (empty-eligible → base page 0)", () => {
    const wed10 = new Date(2026, 5, 24, 10, 0).getTime(); // Wed 10:00 local
    const inWindow = [undefined, { schedule: { startMin: 540, endMin: 1020 } }]; // 09–17, both eligible
    expect([0, 1]).toContain(activePageAt(wed10, 2, inWindow, 10));
    const evening = [undefined, { schedule: { startMin: 1080, endMin: 1200 } }]; // 18–20 → page1 excluded
    expect(activePageAt(wed10, 2, evening, 10)).toBe(0);
    const allOff = [{ schedule: { startMin: 1080, endMin: 1200 } }, { schedule: { startMin: 1080, endMin: 1200 } }];
    expect(activePageAt(wed10, 2, allOff, 10)).toBe(0); // nothing eligible → fall back to page 0
  });
  it("skips a blank extra page when the page list is supplied (half-built page never flashes empty)", () => {
    const filled = [{ id: "r", blocks: [{ id: "b", type: "divider", props: {} }] }];
    const withEmpty = [filled, []] as never; // page 0 has content, page 1 is empty
    expect(activePageAt(0, 2, undefined, 10, withEmpty)).toBe(0);
    expect(activePageAt(12_000, 2, undefined, 10, withEmpty)).toBe(0); // would be page 1 without the skip
    expect(activePageAt(12_000, 2, undefined, 10, [filled, filled] as never)).toBe(1); // both filled → rotates
  });
});

describe("pageScheduleActive (v10)", () => {
  const wed = new Date(2026, 5, 24, 10, 30); // Wed June 24 2026, 10:30 local (day 3)
  it("absent schedule is always on", () => {
    expect(pageScheduleActive(undefined, wed)).toBe(true);
  });
  it("daily time window, with midnight wrap", () => {
    expect(pageScheduleActive({ startMin: 540, endMin: 1020 }, wed)).toBe(true); // 09–17 incl 10:30
    expect(pageScheduleActive({ startMin: 660, endMin: 1020 }, wed)).toBe(false); // 11–17 excl 10:30
    const night = { startMin: 1320, endMin: 360 }; // 22:00–06:00 wraps
    expect(pageScheduleActive(night, new Date(2026, 5, 24, 23, 0))).toBe(true);
    expect(pageScheduleActive(night, wed)).toBe(false);
  });
  it("weekday mask", () => {
    expect(pageScheduleActive({ daysMask: 0b0111110 }, wed)).toBe(true); // Mon–Fri includes Wed
    expect(pageScheduleActive({ daysMask: 0b0000001 }, wed)).toBe(false); // Sun only
  });
  it("inclusive date range", () => {
    expect(pageScheduleActive({ fromDate: "2026-06-01", toDate: "2026-06-30" }, wed)).toBe(true);
    expect(pageScheduleActive({ fromDate: "2026-07-01" }, wed)).toBe(false);
    expect(pageScheduleActive({ toDate: "2026-06-23" }, wed)).toBe(false);
    expect(pageScheduleActive({ fromDate: "2026-06-24", toDate: "2026-06-24" }, wed)).toBe(true);
  });
});

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

describe("render isolation — one bad block never blanks the wall (v7.0 P0)", () => {
  it("a throwing widget paints a calm placeholder; its siblings stay alive", () => {
    renderPayload({ claimed: true, state: { layoutVersion: 1, data: {}, layout: { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
      { id: "ok", type: "heading", width: 1, props: { content: "Alive", level: 1 } },
      { id: "bad", type: "__throw", width: 1, props: {} },
    ] }] } } } as unknown as StreamPayloadT);
    // The page rendered (not blanked) and the healthy sibling is intact.
    expect(document.querySelectorAll("#app > .page").length).toBe(1);
    expect(document.querySelector(".widget-heading")?.textContent).toContain("Alive");
    // The throwing cell exists but shows a calm placeholder instead of crashing the page.
    const bad = document.querySelector(".widget-__throw");
    expect(bad).toBeTruthy();
    expect(bad?.querySelector(".placeholder")).toBeTruthy();
  });
});

describe("in-place edit layer — contentEditable + lock (v8.0)", () => {
  const mkLayout = (content: string) => ({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
    { id: "h", type: "heading", width: 1, props: { content, level: 1 } },
    { id: "clk", type: "clock", width: 1, props: { showDate: false } },
  ] }] });
  const pay = (layout: object): StreamPayloadT => ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;

  it("wires the real text node, posts edits, and locks the cell so a re-render can't kill the caret", () => {
    const posted: Array<Record<string, unknown>> = [];
    let doc = mkLayout("Hi");
    renderPayload(pay(doc));
    const layer = createEditLayer({ post: (m) => posted.push(m as Record<string, unknown>), getDoc: () => doc as never });
    layer.refresh();

    const node = document.querySelector(".heading") as HTMLElement;
    expect(node.getAttribute("contenteditable")).toBeTruthy(); // the ACTUAL rendered text is editable
    expect(node.classList.contains("glance-editable")).toBe(true);

    node.dispatchEvent(new FocusEvent("focus"));
    expect(posted.some((m) => m.type === "glanceos:focus" && m.id === "h")).toBe(true); // selects the block in the Studio

    // Typing shows instantly via native contentEditable; the sync is debounced (not posted
    // per keystroke — that churn was the "glitch"). So nothing is posted synchronously here.
    node.textContent = "Hello";
    node.dispatchEvent(new InputEvent("input"));
    expect(posted.some((m) => m.type === "glanceos:edit")).toBe(false); // debounced — no per-keystroke round-trip

    // The crucial bit: while focused, a re-render with CHANGED props must NOT repaint the
    // edited cell (that would tear down the node the caret lives in).
    doc = mkLayout("CHANGED");
    renderPayload(pay(doc));
    expect((document.querySelector(".heading") as HTMLElement).textContent).toBe("Hello"); // locked → user's text kept

    node.dispatchEvent(new FocusEvent("blur"));
    expect(posted.find((m) => m.type === "glanceos:edit")).toMatchObject({ id: "h", patch: { content: "Hello" }, phase: "commit" }); // flushed on blur
    renderPayload(pay(mkLayout("AFTER")));
    expect((document.querySelector(".heading") as HTMLElement).textContent).toBe("AFTER"); // unlocked → repaints normally
  });

  it("makes list items editable per-item and serializes the list on commit", async () => {
    const posted: Array<Record<string, unknown>> = [];
    const mkList = (items: string) => ({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [{ id: "lst", type: "bulletList", width: 1, props: { items } }] }] });
    let doc = mkList("Milk\nEggs");
    renderPayload(pay(doc));
    const layer = createEditLayer({ post: (m) => posted.push(m as Record<string, unknown>), getDoc: () => doc as never });
    layer.refresh();

    const items = document.querySelectorAll<HTMLElement>(".li-text");
    expect(items.length).toBe(2);
    expect(items[0]!.getAttribute("contenteditable")).toBeTruthy(); // each item is editable in place

    items[0]!.dispatchEvent(new FocusEvent("focus"));
    expect(posted.some((m) => m.type === "glanceos:focus" && m.id === "lst")).toBe(true);
    items[0]!.textContent = "Bread";
    items[0]!.dispatchEvent(new InputEvent("input"));
    expect(posted.some((m) => m.type === "glanceos:edit")).toBe(false); // debounced — no per-keystroke churn

    // locked while editing → a re-render doesn't wipe the items the user is editing
    doc = mkList("XXX\nYYY");
    renderPayload(pay(doc));
    expect(document.querySelectorAll<HTMLElement>(".li-text")[0]!.textContent).toBe("Bread");

    items[0]!.dispatchEvent(new FocusEvent("blur"));
    await new Promise((r) => setTimeout(r, 0)); // list blur commits on a 0ms tick (after focus-out check)
    expect(posted.find((m) => m.type === "glanceos:edit")).toMatchObject({ id: "lst", patch: { items: "Bread\nEggs" }, phase: "commit" });
  });

  it("makes table cells editable and serializes the grid on commit", async () => {
    const posted: Array<Record<string, unknown>> = [];
    const mkTable = (content: string) => ({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [{ id: "tbl", type: "table", width: 1, props: { content, header: true } }] }] });
    let doc = mkTable("Name, Status\nDoor, Locked");
    renderPayload(pay(doc));
    const layer = createEditLayer({ post: (m) => posted.push(m as Record<string, unknown>), getDoc: () => doc as never });
    layer.refresh();

    const tcells = document.querySelectorAll<HTMLElement>(".data-table th, .data-table td");
    expect(tcells.length).toBe(4);
    expect(tcells[2]!.getAttribute("contenteditable")).toBeTruthy(); // the "Door" cell edits in place
    tcells[2]!.dispatchEvent(new FocusEvent("focus"));
    tcells[2]!.textContent = "Window";
    tcells[2]!.dispatchEvent(new InputEvent("input"));
    expect(posted.some((m) => m.type === "glanceos:edit")).toBe(false); // debounced

    doc = mkTable("X, Y\nZ, W"); renderPayload(pay(doc)); // locked → kept
    expect(document.querySelectorAll<HTMLElement>(".data-table th, .data-table td")[2]!.textContent).toBe("Window");

    tcells[2]!.dispatchEvent(new FocusEvent("blur"));
    await new Promise((r) => setTimeout(r, 0));
    expect(posted.find((m) => m.type === "glanceos:edit")).toMatchObject({ id: "tbl", patch: { content: "Name, Status\nWindow, Locked" }, phase: "commit" });
  });
});

describe("in-place edit — v9.0 broad coverage", () => {
  const pay = (layout: object): StreamPayloadT => ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;
  const wire = (block: object): Array<Record<string, unknown>> => {
    const posted: Array<Record<string, unknown>> = [];
    const doc = { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [block] }] };
    renderPayload(pay(doc));
    createEditLayer({ post: (m) => posted.push(m as Record<string, unknown>), getDoc: () => doc as never }).refresh();
    return posted;
  };

  it("edits BOTH fields of a multi-field block (definition: term + meaning)", () => {
    const posted = wire({ id: "d", type: "definition", width: 1, props: { term: "API", meaning: "interface" } });
    const term = document.querySelector(".def-term") as HTMLElement;
    expect(term.getAttribute("contenteditable")).toBeTruthy();
    expect((document.querySelector(".def-meaning") as HTMLElement).getAttribute("contenteditable")).toBeTruthy();
    term.dispatchEvent(new FocusEvent("focus"));
    term.textContent = "REST";
    term.dispatchEvent(new FocusEvent("blur"));
    expect(posted.find((m) => m.type === "glanceos:edit")).toMatchObject({ id: "d", patch: { term: "REST" } });
  });

  it("edits a two-column list per-row and serializes `key: value` (keyValue)", async () => {
    const posted = wire({ id: "kv", type: "keyValue", width: 1, props: { pairs: "Name: Ada\nRole: Eng" } });
    const keys = document.querySelectorAll<HTMLElement>(".kv-key");
    const vals = document.querySelectorAll<HTMLElement>(".kv-val");
    expect(keys.length).toBe(2);
    expect(keys[0]!.getAttribute("contenteditable")).toBeTruthy();
    expect(vals[0]!.getAttribute("contenteditable")).toBeTruthy();
    vals[0]!.dispatchEvent(new FocusEvent("focus"));
    vals[0]!.textContent = "Grace";
    vals[0]!.dispatchEvent(new FocusEvent("blur"));
    await new Promise((r) => setTimeout(r, 0));
    expect(posted.find((m) => m.type === "glanceos:edit")).toMatchObject({ id: "kv", patch: { pairs: "Name: Grace\nRole: Eng" } });
  });

  it("gives every list a '+ add' affordance (checklist)", () => {
    wire({ id: "c", type: "checklist", width: 1, props: { items: "buy milk" } });
    expect(document.querySelector(".list .gl-additem")?.textContent).toContain("add");
  });

  it("fixes the moneyStat / unitStat selectors so the value edits in place", () => {
    wire({ id: "m", type: "moneyStat", width: 1, props: { label: "Rev", currency: "$", amount: "100" } });
    expect((document.querySelector(".stat-value") as HTMLElement).getAttribute("contenteditable")).toBeTruthy();
    wire({ id: "u", type: "unitStat", width: 1, props: { label: "Spd", value: "88", unit: "mph" } });
    expect((document.querySelector(".metric-value") as HTMLElement).getAttribute("contenteditable")).toBeTruthy();
  });
});

describe("deck / slideshow (v8.0 rotation)", () => {
  const pay = (layout: object): StreamPayloadT => ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;
  it("renders one slide + a progress dot per slide, deterministically from the wall clock", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(25_000)); // floor(25/10) % 3 = 2 → the third slide
      const doc = { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [{ id: "d", type: "deck", width: 1, props: { slides: "Alpha\n\nBeta\n\nGamma", seconds: 10 } }] }] };
      renderPayload(pay(doc));
      expect(document.querySelector(".deck-slide")!.textContent).toBe("Gamma");
      expect(document.querySelectorAll(".deck-dot").length).toBe(3);
      expect(document.querySelectorAll(".deck-dot.on").length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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

describe("authored fallback (#22)", () => {
  const mk = (data: Record<string, unknown>) => renderPayload({ claimed: true, state: { layoutVersion: 1, data, layout: {
    ...baseLayout,
    rows: [{ id: "r1", h: 6, blocks: [{ id: "s", type: "stat", width: 1, props: { value: "12" }, fallback: "No data yet" }] }],
  } } } as unknown as StreamPayloadT);

  it("shows the fallback when the bound datum is missing, and the widget once data arrives", () => {
    mk({}); // nothing at data.s → fallback
    expect([...document.querySelectorAll(".placeholder")].some((p) => p.textContent === "No data yet")).toBe(true);
    mk({ s: { value: 42 } }); // data present → real widget, no fallback
    expect([...document.querySelectorAll(".placeholder")].some((p) => p.textContent === "No data yet")).toBe(false);
  });

  it("treats an empty array as no data", () => {
    mk({ s: [] });
    expect([...document.querySelectorAll(".placeholder")].some((p) => p.textContent === "No data yet")).toBe(true);
  });
});

describe("daily brief + contextual greeting (#148/#154)", () => {
  it("renders the server-composed brief: greeting, weather, events, tasks", () => {
    renderPayload({ claimed: true, state: { layoutVersion: 1, data: {
      brf: { greeting: "Good morning", dateLabel: "Monday, June 29", weatherLine: "18°, sunny", events: [{ time: "9:00 AM", title: "Standup", location: "Room 3" }], tasks: ["Ship it"] },
    }, layout: { ...baseLayout, rows: [{ id: "r", h: 9, blocks: [
      { id: "brf", type: "dailyBrief", width: 1, props: { title: "Today", showDate: true, showWeather: true, maxEvents: 3, maxTasks: 2 } },
    ] }] } } } as unknown as StreamPayloadT);
    expect((document.querySelector(".brief-greet") as HTMLElement).textContent).toBe("Good morning");
    expect((document.querySelector(".brief-wx") as HTMLElement).textContent).toContain("sunny");
    expect((document.querySelector(".brief-event-title") as HTMLElement).textContent).toContain("Standup");
    expect((document.querySelector(".brief-task-text") as HTMLElement).textContent).toBe("Ship it");
  });

  it("greeting shows the server contextual line when showContext is on", () => {
    renderPayload({ claimed: true, state: { layoutVersion: 1, data: { g: { contextualGreeting: "Good morning  ·  3 meetings today" } }, layout: { ...baseLayout, rows: [{ id: "r", h: 4, blocks: [
      { id: "g", type: "greeting", width: 1, props: { name: "", showContext: true, maxContextLength: 200 } },
    ] }] } } } as unknown as StreamPayloadT);
    expect((document.querySelector(".greeting") as HTMLElement).textContent).toContain("3 meetings today");
  });
});

describe("focus mode (#149)", () => {
  const board = (focus: boolean) => ({ claimed: true, state: { layoutVersion: 1, data: focus ? { __focus: true } : {}, layout: { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
    { id: "keep", type: "divider", width: 1, props: {} },
    { id: "noisy", type: "divider", width: 1, props: {}, focusHide: true },
  ] }] } } } as unknown as StreamPayloadT);

  it("hides focusHide blocks only when focus is active", () => {
    renderPayload(board(false));
    expect(document.querySelectorAll("#app .widget").length).toBe(2);
    renderPayload(board(true));
    expect(document.querySelectorAll("#app .widget").length).toBe(1);
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

describe("v7.0 calm-glance hero blocks", () => {
  const ITEMS = "09:00 | Standup | Room 3\n12:30 | Lunch\n16:00 | Review | Zoom";
  const one = (block: object) =>
    renderPayload(payload({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [block] }] }) as StreamPayloadT);

  it("focusNow shows the running event as the hero (kicker 'Now')", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 22, 9, 15, 0)); // mid-standup (09:00–10:00)
      one({ id: "f", type: "focusNow", width: 1, props: { label: "", items: ITEMS } });
      expect(document.querySelector(".focus-kicker")!.textContent).toBe("Now");
      expect(document.querySelector(".focus-title")!.textContent).toBe("Standup");
      expect(document.querySelector(".focus-meta")!.textContent).toBe("Room 3");
    } finally { vi.useRealTimers(); }
  });

  it("focusNow falls back to the next event with a countdown ('Next')", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 22, 8, 50, 0)); // 10 min before standup
      one({ id: "f", type: "focusNow", width: 1, props: { label: "", items: ITEMS } });
      expect(document.querySelector(".focus-kicker")!.textContent).toBe("Next");
      expect(document.querySelector(".focus-title")!.textContent).toBe("Standup");
      expect(document.querySelector(".focus-meta")!.textContent).toBe("in 10 min · Room 3");
    } finally { vi.useRealTimers(); }
  });

  it("leaveBy counts down to next-event-minus-travel, then says 'Leave now'", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 22, 8, 30, 0)); // 30 min before standup, 15 min travel → leave in 15
      one({ id: "l", type: "leaveBy", width: 1, props: { label: "Leave by", items: ITEMS, travelMinutes: 15 } });
      expect(document.querySelector(".leaveby-time")!.textContent).toBe("Leave in 15 min");
      expect(document.querySelector(".leaveby-sub")!.textContent).toContain("Standup");
      expect(document.querySelector(".leaveby-sub")!.textContent).toContain("Room 3");
      // self-updating: once inside the travel window it flips to "Leave now" with no re-render
      vi.setSystemTime(new Date(2026, 5, 22, 8, 50, 0));
      vi.advanceTimersByTime(30_000);
      expect(document.querySelector(".leaveby-time")!.textContent).toBe("Leave now");
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

describe("designable objects — per-block style classes (v9.0)", () => {
  const pay = (layout: object): StreamPayloadT => ({ claimed: true, state: { layoutVersion: 1, data: {}, layout } }) as unknown as StreamPayloadT;
  it("applies pad/border/radius/bg classes only when set; a plain block is unchanged", () => {
    const st = (extra: object) => ({ invert: false, align: "start", valign: "top", ...extra });
    renderPayload(pay({ ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
      { id: "plain", type: "stat", width: 1, style: st({}), props: { label: "P", value: "1" } },
      { id: "card", type: "stat", width: 1, style: st({ pad: "m", border: "strong", radius: "l", bg: "subtle", size: "l" }), props: { label: "C", value: "2" } },
    ] }] }));
    const cells = document.querySelectorAll<HTMLElement>(".widget-stat");
    expect(cells[0]!.className).not.toMatch(/pad-|bd-|rad-|bg-|bsize-/); // plain → no decoration
    expect(cells[1]!.className).toContain("pad-m");
    expect(cells[1]!.className).toContain("bd-strong");
    expect(cells[1]!.className).toContain("rad-l");
    expect(cells[1]!.className).toContain("bg-subtle");
    expect(cells[1]!.className).toContain("bsize-l");
  });
});

describe("multi-page boards (v9.x)", () => {
  it("activePageIndex rotates by the wall clock; 1 page or 0s stays on page 0", () => {
    expect(activePageIndex(0, 10, 1)).toBe(0);
    expect(activePageIndex(50_000, 0, 3)).toBe(0);
    expect(activePageIndex(0, 10, 3)).toBe(0);
    expect(activePageIndex(10_000, 10, 3)).toBe(1);
    expect(activePageIndex(25_000, 10, 3)).toBe(2);
    expect(activePageIndex(35_000, 10, 3)).toBe(0); // wraps
  });

  it("renders the active page and rebuilds when it changes", () => {
    const A = { id: "ra", h: 6, blocks: [{ id: "a", type: "heading", width: 1, props: { content: "PAGEA", level: 1 } }] };
    const B = { id: "rb", h: 6, blocks: [{ id: "b", type: "heading", width: 1, props: { content: "PAGEB", level: 1 } }] };
    const doc = { ...baseLayout, rows: [A], pages: [[B]], pageRotateSeconds: 10 };
    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    renderPayload(payload(doc));
    expect(document.body.textContent).toContain("PAGEA");
    expect(document.body.textContent).not.toContain("PAGEB");
    now.mockReturnValue(10_000); // wall clock advances one page
    renderPayload(payload(doc));
    expect(document.body.textContent).toContain("PAGEB");
    now.mockRestore();
  });
});

describe("value-conditional visibility — visibleWhen (#50)", () => {
  it("hides a block failing its value test and shows one that passes", () => {
    const layout = { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
      { id: "hi", type: "stat", width: 1, props: { value: "7", label: "HideMe" }, visibleWhen: { op: "gt", value: 100 } },
      { id: "lo", type: "stat", width: 1, props: { value: "7", label: "ShowMe" }, visibleWhen: { op: "lt", value: 100 } },
    ] }] };
    renderPayload(payload(layout));
    const txt = document.getElementById("app")!.textContent || "";
    expect(txt).toContain("ShowMe");
    expect(txt).not.toContain("HideMe");
  });
  it("empty / nonempty test against resolved data", () => {
    const layout = { ...baseLayout, rows: [{ id: "r", h: 6, blocks: [
      { id: "a", type: "stat", width: 1, props: { label: "A" }, visibleWhen: { op: "nonempty" } },
      { id: "b", type: "stat", width: 1, props: { label: "B" }, visibleWhen: { op: "empty" } },
    ] }] };
    renderPayload({ claimed: true, state: { layoutVersion: 1, layout, data: { a: 42 } } } as never);
    const txt = document.getElementById("app")!.textContent || "";
    expect(txt).toContain("A"); // has data → nonempty passes
    expect(txt).not.toContain("B"); // has data → empty fails → hidden
  });
});
