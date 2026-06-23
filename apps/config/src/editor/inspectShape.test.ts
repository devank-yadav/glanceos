import { describe, expect, it } from "vitest";
import { arrayPaths, atPath, itemKeys, scalarPaths } from "./inspectShape";

describe("data inspector shape helpers", () => {
  it("arrayPaths finds arrays with counts (depth ≤ 2)", () => {
    expect(arrayPaths({ items: [1, 2, 3] })).toEqual([{ path: "items", n: 3 }]);
    expect(arrayPaths([1, 2])).toEqual([{ path: "", n: 2 }]); // root array
    expect(arrayPaths({ data: { results: [{}, {}] } })).toEqual([{ path: "data.results", n: 2 }]);
    expect(arrayPaths({ a: 1, b: "x" })).toEqual([]); // no arrays
  });

  it("itemKeys returns scalar keys of the first element", () => {
    expect(itemKeys([{ title: "Hi", score: 5, nested: { x: 1 } }])).toEqual(["title", "score"]);
    expect(itemKeys([])).toEqual([]);
    expect(itemKeys("not an array")).toEqual([]);
  });

  it("scalarPaths returns dotted leaf paths (depth ≤ 3)", () => {
    const paths = scalarPaths({ results: { visitors: { value: 42 } }, name: "x" });
    expect(paths).toContain("results.visitors.value");
    expect(paths).toContain("name");
    expect(scalarPaths({ items: [1, 2] })).toEqual([]); // arrays are not scalar leaves
  });

  it("atPath reads dotted paths; blank = whole value", () => {
    const v = { a: { b: { c: 7 } }, list: [{ k: 1 }] };
    expect(atPath(v, "a.b.c")).toBe(7);
    expect(atPath(v, "list")).toEqual([{ k: 1 }]);
    expect(atPath(v, "")).toBe(v);
    expect(atPath(v, "a.missing.c")).toBeUndefined();
  });

  it("end-to-end: a reddit-style payload yields a list path + per-item fields", () => {
    const payload = { items: [{ title: "Hello", score: 42, comments: 7, url: "https://r/x" }] };
    const arrs = arrayPaths(payload);
    expect(arrs[0]).toEqual({ path: "items", n: 1 });
    expect(itemKeys(atPath(payload, "items"))).toEqual(["title", "score", "comments", "url"]);
  });
});
