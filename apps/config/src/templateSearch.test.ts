import { describe, expect, it } from "vitest";
import { filterTemplates, templateMatches } from "./templateSearch";

const T = (name: string, category: string, description = "") => ({ name, category, description });

describe("templateMatches", () => {
  it("matches everything on an empty query", () => {
    expect(templateMatches(T("Weekly planner", "Productivity"), "")).toBe(true);
    expect(templateMatches(T("Weekly planner", "Productivity"), "   ")).toBe(true);
  });

  it("is case-insensitive across name, category and description", () => {
    const t = T("Morning Brief", "Home", "weather and the day ahead");
    expect(templateMatches(t, "morning")).toBe(true);
    expect(templateMatches(t, "HOME")).toBe(true);
    expect(templateMatches(t, "weather")).toBe(true);
  });

  it("requires ALL terms to be present (AND semantics)", () => {
    const t = T("Dark dashboard", "Office", "a calm status wall");
    expect(templateMatches(t, "dark wall")).toBe(true);
    expect(templateMatches(t, "dark beach")).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(templateMatches(T("Sports scores", "Sports"), "recipe")).toBe(false);
  });
});

describe("filterTemplates", () => {
  const items = [
    T("Weekly planner", "Productivity", "your week at a glance"),
    T("Crypto ticker", "Finance", "coins and prices"),
    T("Moon phase", "Home", "tonight's sky"),
  ];

  it("returns all when category=All and query empty", () => {
    expect(filterTemplates(items, "All", "")).toHaveLength(3);
  });

  it("filters by category alone", () => {
    expect(filterTemplates(items, "Finance", "").map((t) => t.name)).toEqual(["Crypto ticker"]);
  });

  it("composes category AND query", () => {
    expect(filterTemplates(items, "Home", "moon").map((t) => t.name)).toEqual(["Moon phase"]);
    expect(filterTemplates(items, "Home", "crypto")).toHaveLength(0);
  });

  it("searches across the whole catalog when category=All", () => {
    expect(filterTemplates(items, "All", "prices").map((t) => t.name)).toEqual(["Crypto ticker"]);
  });
});
