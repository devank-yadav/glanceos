import { describe, expect, it } from "vitest";
import { findReplaceInDoc, countMatches } from "./findReplace";
import type { LayoutT } from "@glanceos/schema";

// #98 — find & replace across a board's text (rows + pages + zones), leaving structural props alone.
const doc = (): LayoutT => ({
  schemaVersion: 3, name: "Board", theme: { mode: "light", fontScale: "m" } as LayoutT["theme"], gap: 2, align: "top",
  rows: [{ id: "r", h: 6, blocks: [
    { id: "a", type: "text", width: 1, props: { content: "Q3 plan for Q3", align: "left" }, name: "Q3 note" },
    { id: "b", type: "image", width: 1, props: { url: "https://x/Q3.png", fit: "cover" } }, // url must NOT change
  ] }],
  pages: [[{ id: "p", h: 6, blocks: [{ id: "c", type: "heading", width: 1, props: { content: "Q3 review", level: 1 } }] }]],
  zones: [{ rect: { x: 0, y: 0, w: 1, h: 1 }, rows: [{ id: "z", h: 6, blocks: [{ id: "d", type: "label", width: 1, props: { content: "no match here" } }] }] }],
}) as unknown as LayoutT;

describe("#98 find & replace", () => {
  it("counts every occurrence across rows, pages, zones (text props + name)", () => {
    // content "Q3 plan for Q3" (2) + name "Q3 note" (1) + page content "Q3 review" (1) = 4; url excluded
    expect(countMatches(doc(), "Q3")).toBe(4);
    expect(countMatches(doc(), "nope")).toBe(0);
    expect(countMatches(doc(), "")).toBe(0);
  });

  it("replaces the text but never the url / enum props, and doesn't mutate the input", () => {
    const input = doc();
    const { doc: out, count } = findReplaceInDoc(input, "Q3", "Q4");
    expect(count).toBe(4);
    expect((out.rows[0]!.blocks[0]!.props as { content: string }).content).toBe("Q4 plan for Q4");
    expect(out.rows[0]!.blocks[0]!.name).toBe("Q4 note");
    expect((out.rows[0]!.blocks[0]!.props as { align: string }).align).toBe("left"); // enum untouched
    expect((out.rows[0]!.blocks[1]!.props as { url: string }).url).toBe("https://x/Q3.png"); // url untouched
    expect(out.pages![0]![0]!.blocks[0]!.props).toMatchObject({ content: "Q4 review" });
    // input unchanged (pure)
    expect((input.rows[0]!.blocks[0]!.props as { content: string }).content).toBe("Q3 plan for Q3");
  });

  it("an empty find is a no-op returning the same object", () => {
    const input = doc();
    expect(findReplaceInDoc(input, "", "x").doc).toBe(input);
  });
});
