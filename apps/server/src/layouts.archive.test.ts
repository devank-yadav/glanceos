import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-archive-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout, listSetups, setArchived, getLayout } = await import("./layouts");

// #107 — archiving a board hides it from the main list (and pickers, which use the same list) but
// keeps it for the archive view + restore. Org-scoped.
describe("#107 board archive (soft delete)", () => {
  const user = createUser("AR", "ar@example.com", "pw-12345678")!;
  const org = ensurePersonalOrg(user.id);
  const a = createLayout("Board A", blankDocument("Board A"), { userId: user.id, orgId: org });
  const b = createLayout("Board B", blankDocument("Board B"), { userId: user.id, orgId: org });

  it("lists both boards as active by default; none archived", () => {
    expect(listSetups(org).map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(listSetups(org, { archived: true })).toEqual([]);
    expect(getLayout(a.id)!.archived).toBe(false);
  });

  it("archiving removes a board from the active list and surfaces it in the archive view", () => {
    expect(setArchived(a.id, org, true)).toBe(true);
    expect(listSetups(org).map((s) => s.id)).toEqual([b.id]);
    expect(listSetups(org, { archived: true }).map((s) => s.id)).toEqual([a.id]);
    expect(getLayout(a.id)!.archived).toBe(true);
  });

  it("won't archive a board from another org", () => {
    expect(setArchived(b.id, "other-org", true)).toBe(false);
    expect(listSetups(org).map((s) => s.id)).toEqual([b.id]); // b still active
  });

  it("restoring brings it back to the active list", () => {
    expect(setArchived(a.id, org, false)).toBe(true);
    expect(listSetups(org).map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(listSetups(org, { archived: true })).toEqual([]);
  });
});
