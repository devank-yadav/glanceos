import { describe, expect, it } from "vitest";
import { compileNotionFilter, type NotionFilterRow } from "./notionFilter";

const row = (p: Partial<NotionFilterRow>): NotionFilterRow => ({ property: "", type: "title", operator: "contains", value: "", ...p });

describe("compileNotionFilter", () => {
  it("returns {} when there are no usable rows", () => {
    expect(compileNotionFilter([])).toEqual({});
    expect(compileNotionFilter([row({ property: "  " })])).toEqual({});
  });

  it("compiles a single condition (no and/or wrapper)", () => {
    expect(compileNotionFilter([row({ property: "Name", type: "title", operator: "contains", value: "todo" })]))
      .toEqual({ filter: { property: "Name", title: { contains: "todo" } } });
  });

  it("coerces checkbox → boolean and number → number", () => {
    expect(compileNotionFilter([row({ property: "Done", type: "checkbox", operator: "equals", value: "true" })]))
      .toEqual({ filter: { property: "Done", checkbox: { equals: true } } });
    expect(compileNotionFilter([row({ property: "Score", type: "number", operator: "greater_than", value: "5" })]))
      .toEqual({ filter: { property: "Score", number: { greater_than: 5 } } });
  });

  it("combines multiple rows under and / or", () => {
    const rows = [row({ property: "Status", type: "select", operator: "equals", value: "Open" }), row({ property: "Score", type: "number", operator: "less_than", value: "10" })];
    const out = compileNotionFilter(rows, "or") as { filter: { or: unknown[] } };
    expect(out.filter.or).toHaveLength(2);
  });
});
