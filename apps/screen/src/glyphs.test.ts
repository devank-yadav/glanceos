import { describe, expect, it } from "vitest";
import { CHECK_OFF, CHECK_ON, moonGlyph, seasonGlyph, STAR_EMPTY, STAR_FULL, stars } from "./glyphs";

describe("screen glyphs (emoji → SVG)", () => {
  it("moonGlyph returns a disc + lit lune for any illumination, both directions", () => {
    for (const illum of [0, 25, 50, 75, 100]) {
      for (const waxing of [true, false]) {
        const svg = moonGlyph(illum, waxing);
        expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
        expect(svg).toContain("<circle");
        expect(svg).toContain("<path");
        expect(svg).not.toMatch(/NaN|undefined/); // the terminator math is finite
      }
    }
  });

  it("seasonGlyph covers the four seasons + falls back", () => {
    for (const s of ["Winter", "Spring", "Summer", "Autumn"]) expect(seasonGlyph(s)).toContain("<svg");
    expect(seasonGlyph("???")).toContain("<svg"); // fallback, never empty
  });

  it("stars() emits one glyph per slot, filled up to the rating", () => {
    expect(stars(3, 5).match(/<svg/g)).toHaveLength(5);
    expect(STAR_FULL).toContain('fill="currentColor"');
    expect(STAR_EMPTY).not.toContain('fill="currentColor"');
  });

  it("check glyphs are distinct", () => {
    expect(CHECK_ON).toContain("<path"); // the tick
    expect(CHECK_OFF).not.toContain("<path"); // empty box only
  });
});
