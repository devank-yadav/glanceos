import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-privtpl-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout, duplicateLayout, listSetups, listPublished } = await import("./layouts");
const { dumpUser, importUser } = await import("./backup");

const u = createUser("Tpl", "tpl@example.com", "password123")!;
const org = ensurePersonalOrg(u.id);
const board = createLayout("Team wall", blankDocument("Team wall"), { userId: u.id, orgId: org });

// #110 — save any board as a PRIVATE reusable template: an org-owned is_template row
// that never reaches the public gallery and never shows up among your boards.
describe("#110 personal template library", () => {
  it("save-as-template COPIES — the original board is untouched and still listed", () => {
    const tpl = duplicateLayout(board.id, org, u.id, { asTemplate: true })!;
    expect(tpl.id).not.toBe(board.id);
    expect(listSetups(org).map((s) => s.name)).toEqual(["Team wall"]); // the board list is unchanged
    expect(listSetups(org, { template: true }).map((s) => s.name)).toEqual(["Team wall copy"]);
  });

  it("a private template is NEVER public — it can't reach the community gallery", () => {
    // The gallery only carries published + approved rows; a save-as-template copy is
    // published=0 by construction, so it can never appear there under any name.
    expect(listPublished().some((l) => l.name === "Team wall copy")).toBe(false);
  });

  it("using a template makes an ordinary board under the chosen name", () => {
    const tpl = listSetups(org, { template: true })[0]!;
    const made = duplicateLayout(tpl.id, org, u.id, { name: "Kitchen wall" })!;
    expect(made.name).toBe("Kitchen wall");
    expect(listSetups(org).map((s) => s.name).sort()).toEqual(["Kitchen wall", "Team wall"]);
    expect(listSetups(org, { template: true })).toHaveLength(1); // the template itself is untouched
  });

  it("another org can neither see nor copy it", () => {
    const other = createUser("Other", "othertpl@example.com", "password123")!;
    const otherOrg = ensurePersonalOrg(other.id);
    const tpl = listSetups(org, { template: true })[0]!;
    expect(listSetups(otherOrg, { template: true })).toEqual([]);
    expect(duplicateLayout(tpl.id, otherOrg, other.id, { name: "Stolen" })).toBeUndefined();
  });

  it("a backup round-trips templates AS templates (they used to come back as boards)", () => {
    const dump = dumpUser(u.id, org, ["boards"]);
    const fresh = createUser("Restore", "restoretpl@example.com", "password123")!;
    const freshOrg = ensurePersonalOrg(fresh.id);
    importUser(fresh.id, freshOrg, dump, { mode: "append" });
    expect(listSetups(freshOrg, { template: true }).map((s) => s.name)).toEqual(["Team wall copy"]);
    expect(listSetups(freshOrg).map((s) => s.name).sort()).toEqual(["Kitchen wall", "Team wall"]);
  });
});

describe("#110 — a private template can't suppress a global starter", () => {
  it("seedTemplates still re-creates a builtin whose name a private template borrowed", async () => {
    const { db } = await import("./db");
    const builtin = db.prepare("SELECT name FROM layouts WHERE is_template = 1 AND org_id IS NULL LIMIT 1").get() as { name: string } | undefined;
    if (!builtin) return; // no builtins seeded in this env — nothing to protect
    createLayout(builtin.name, blankDocument(builtin.name), { userId: u.id, orgId: org, isTemplate: true });
    db.prepare("DELETE FROM layouts WHERE is_template = 1 AND org_id IS NULL AND name = ?").run(builtin.name);
    const { seedTemplates } = await import("./seed");
    seedTemplates();
    const back = db.prepare("SELECT id FROM layouts WHERE is_template = 1 AND org_id IS NULL AND name = ?").get(builtin.name);
    expect(back).toBeTruthy(); // the starter came back despite the same-named private template
  });
});
