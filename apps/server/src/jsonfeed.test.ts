import { describe, expect, it } from "vitest";
import { applyTemplate } from "./fetchers/jsonfeed";

describe("jsonFeed template engine", () => {
  const data = {
    title: "Weather",
    temp: 21,
    nested: { city: "Delhi" },
    items: [{ name: "First" }, { name: "Second" }],
  };

  it("resolves dotted paths and array indices", () => {
    expect(applyTemplate("{{title}}\n{{nested.city}} {{temp}}°", data)).toEqual(["Weather", "Delhi 21°"]);
    expect(applyTemplate("{{items.0.name}} / {{items[1].name}}", data)).toEqual(["First / Second"]);
  });

  it("blanks missing fields and drops empty lines", () => {
    expect(applyTemplate("{{nope}}\n{{title}}\n{{also.missing}}", data)).toEqual(["Weather"]);
  });

  it("never executes anything — only interpolates", () => {
    expect(applyTemplate("{{title}}", { title: "<b>x</b>" })).toEqual(["<b>x</b>"]);
  });
});
