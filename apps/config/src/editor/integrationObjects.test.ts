import { describe, expect, it } from "vitest";
import { BINDABLE, BLOCKS, type WidgetType } from "./blocks";
import { INTEGRATION_OBJECTS, objectsForProvider, PROVIDERS_WITH_OBJECTS } from "./integrationObjects";

const BLOCK_TYPES = new Set<WidgetType>(BLOCKS.map((b) => b.type));

describe("integration preset objects (B8)", () => {
  it("has presets and a provider index", () => {
    expect(INTEGRATION_OBJECTS.length).toBeGreaterThanOrEqual(20);
    expect(PROVIDERS_WITH_OBJECTS.length).toBeGreaterThanOrEqual(15);
  });

  it("every preset targets a real, bindable block type", () => {
    for (const o of INTEGRATION_OBJECTS) {
      expect(BLOCK_TYPES.has(o.blockType), `${o.providerId}.${o.id} → unknown block ${o.blockType}`).toBe(true);
      expect(BINDABLE.has(o.blockType), `${o.providerId}.${o.id} → ${o.blockType} is not BINDABLE`).toBe(true);
    }
  });

  it("every sourceKind is well-formed and its prefix matches the providerId", () => {
    for (const o of INTEGRATION_OBJECTS) {
      expect(o.sourceKind.length).toBeGreaterThan(0);
      expect(o.sourceKind).toContain(".");
      expect(o.sourceKind.split(".")[0]).toBe(o.providerId);
    }
  });

  it("every preset has a sane defaultH and a non-empty label", () => {
    for (const o of INTEGRATION_OBJECTS) {
      expect(o.defaultH).toBeGreaterThanOrEqual(1);
      expect(o.defaultH).toBeLessThanOrEqual(24);
      expect(o.label.trim().length).toBeGreaterThan(0);
      expect(o.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("preset ids are unique within each provider", () => {
    const seen = new Set<string>();
    for (const o of INTEGRATION_OBJECTS) {
      const key = `${o.providerId}/${o.id}`;
      expect(seen.has(key), `duplicate preset ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("scalar presets map a path; list presets map an items array", () => {
    for (const o of INTEGRATION_OBJECTS) {
      const hasPath = !!o.map.path;
      const hasItems = o.map.items !== undefined;
      expect(hasPath || hasItems, `${o.providerId}.${o.id} → map needs a path or items`).toBe(true);
    }
  });

  it("objectsForProvider filters correctly", () => {
    const reddit = objectsForProvider("reddit");
    expect(reddit.length).toBeGreaterThan(0);
    expect(reddit.every((o) => o.providerId === "reddit")).toBe(true);
    expect(objectsForProvider("nope-not-a-provider")).toEqual([]);
  });
});
