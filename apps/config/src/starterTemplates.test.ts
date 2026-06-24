import { Layout } from "@glanceos/schema";
import { describe, expect, it } from "vitest";
import { STARTER_CATEGORIES, STARTER_TEMPLATES } from "./starterTemplates";

// Guards the built-in gallery: every shipped template must be a valid board the
// screen runtime can render, ids must be unique, and every category populated.
describe("starter templates", () => {
  it("ships the full template gallery with unique ids", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(118);
    const ids = new Set(STARTER_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(STARTER_TEMPLATES.length);
  });

  it("covers every category", () => {
    for (const c of STARTER_CATEGORIES) {
      expect(STARTER_TEMPLATES.some((t) => t.category === c), `no template for "${c}"`).toBe(true);
    }
  });

  for (const t of STARTER_TEMPLATES) {
    it(`"${t.name}" parses against the Layout schema`, () => {
      const r = Layout.safeParse(t.doc);
      if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      expect(r.success).toBe(true);
      // rows should roughly fill the 24-unit page (a real full-screen design)
      const totalH = t.doc.rows.reduce((s, row) => s + row.h, 0);
      expect(totalH, `${t.name} rows sum to ${totalH}`).toBeGreaterThanOrEqual(12);
    });
  }
});
