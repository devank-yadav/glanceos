import { describe, expect, it, vi } from "vitest";
import type { BlockSourceT } from "@glanceos/schema";
import { assertSafeUrl } from "../fetchers/cache";
import { applyMap, resolveSource } from "./resolve";

describe("applyMap — source → block-data shaping", () => {
  const raw = { results: [{ count: 3, date: "Mon" }, { count: 5, date: "Tue" }, { count: 8, date: "Wed" }], total: 16 };

  it("series: array path + value field → number[]", () => {
    expect(applyMap(raw, { path: "", items: "results", fields: { value: "count" }, transform: "series" })).toEqual([3, 5, 8]);
  });
  it("sum/count reduce an array", () => {
    expect(applyMap(raw, { path: "", items: "results", fields: { value: "count" }, transform: "sum" })).toBe(16);
    expect(applyMap(raw, { path: "", items: "results", transform: "count" })).toBe(3);
  });
  it("scalar: dotted path → value", () => {
    expect(applyMap(raw, { path: "total", transform: "first" })).toBe(16);
  });
  it("passthrough hands the payload straight through", () => {
    const cal = { events: [{ title: "x" }] };
    expect(applyMap(cal, { path: "", transform: "none" })).toBe(cal);
  });
  it("wrong shape (object where an array is wanted) → null, never garbage", () => {
    expect(applyMap(raw, { path: "", items: "total", fields: { value: "count" }, transform: "series" })).toBeNull();
  });
});

describe("resolveSource — offline-safe", () => {
  it("returns null when the fetch fails, never throws", async () => {
    const original = global.fetch;
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    try {
      const src: BlockSourceT = { kind: "rest", query: { url: "https://example.com/data.json" }, map: { path: "x", transform: "first" } };
      await expect(resolveSource(src)).resolves.toBeNull();
    } finally {
      global.fetch = original;
    }
  });

  it("a connection-backed source with no lookup resolves to null", async () => {
    const src: BlockSourceT = { connectionId: "c1", kind: "todoist.tasks", query: {}, map: { path: "", transform: "none" } };
    await expect(resolveSource(src)).resolves.toBeNull();
  });
});

describe("SSRF guard", () => {
  it("blocks loopback, link-local/metadata and private addresses", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(assertSafeUrl("http://192.168.1.1/")).rejects.toThrow();
    await expect(assertSafeUrl("http://[::1]/")).rejects.toThrow();
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow();
  });
});
