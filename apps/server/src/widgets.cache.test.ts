import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-wcache-"));
const { migrate } = await import("./db");
migrate();
const { rememberResolved, lastResolved } = await import("./widgets");

// #21 — the last-known cache that resolveWidgetData serves on a transient source failure.
describe("#21 last-known cache", () => {
  it("remembers a resolved value with its timestamp, newest wins", () => {
    rememberResolved("blk1", { value: 42 }, 1000);
    expect(lastResolved("blk1")).toEqual({ value: { value: 42 }, at: 1000 });
    rememberResolved("blk1", { value: 99 }, 2000);
    expect(lastResolved("blk1")).toEqual({ value: { value: 99 }, at: 2000 });
  });

  it("returns undefined for a block never resolved", () => {
    expect(lastResolved("never-seen")).toBeUndefined();
  });

  it("is memory-bounded — evicts the oldest entries past the cap", () => {
    for (let i = 0; i < 2200; i++) rememberResolved(`b${i}`, i, i);
    expect(lastResolved("b0")).toBeUndefined();        // oldest, evicted
    expect(lastResolved("b2199")!.value).toBe(2199);   // newest, kept
  });

  it("re-resolving an old key refreshes its recency (not evicted next)", () => {
    rememberResolved("keepme", "v", 1);
    for (let i = 0; i < 1999; i++) rememberResolved(`f${i}`, i, i); // fill near the cap
    rememberResolved("keepme", "v2", 5);                            // touch → newest again
    for (let i = 0; i < 200; i++) rememberResolved(`g${i}`, i, i);  // push the cap over
    expect(lastResolved("keepme")?.value).toBe("v2");              // survived because it was refreshed
  });
});
