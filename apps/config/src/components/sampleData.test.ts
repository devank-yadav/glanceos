import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";
import { sampleDataFor } from "./sampleData";

const doc = (blocks: { id: string; type: string; source?: unknown }[]): LayoutT =>
  ({ schemaVersion: 3, name: "T", rows: [{ id: "r1", blocks }] }) as unknown as LayoutT;

describe("#118 sampleDataFor (template previews get a living wall)", () => {
  it("always-live types get samples even without a source", () => {
    const d = sampleDataFor(doc([{ id: "w1", type: "weather" }, { id: "c1", type: "calendar" }]));
    expect((d.w1 as { temperatureC: number }).temperatureC).toBe(21);
    expect((d.c1 as { events: unknown[] }).events).toHaveLength(3);
  });

  it("bound blocks sample by type; static blocks are left alone", () => {
    const d = sampleDataFor(doc([
      { id: "s1", type: "sparkline", source: { kind: "rest" } },
      { id: "h1", type: "heading" }, // static — must NOT be overridden
      { id: "st1", type: "stat", source: { kind: "rest" } },
    ]));
    expect(Array.isArray(d.s1)).toBe(true);
    expect(d.h1).toBeUndefined();
    expect(d.st1).toBe(68);
  });

  it("an unknown bound type stays untouched (the runtime's placeholder owns it)", () => {
    const d = sampleDataFor(doc([{ id: "x1", type: "someExoticBlock", source: { kind: "rest" } }]));
    expect(d.x1).toBeUndefined();
  });

  it("walks extra pages and zones too", () => {
    const base = doc([{ id: "a", type: "weather" }]) as unknown as Record<string, unknown>;
    base.pages = [[{ id: "r2", blocks: [{ id: "b", type: "tasks" }] }]];
    base.zones = [{ id: "z", rows: [{ id: "r3", blocks: [{ id: "c", type: "queue" }] }] }];
    const d = sampleDataFor(base as unknown as LayoutT);
    expect(Object.keys(d).sort()).toEqual(["a", "b", "c"]);
  });
});
