import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-probe2-"));
process.env.GLANCEOS_RATE_LIMIT = "off";
const { migrate } = await import("./db");
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { createLayout, getOwnedLayout } = await import("./layouts");
const { dryRunAutomation } = await import("./automation/engine");
migrate();
describe("probe2", () => {
  it("board-scoped automation sees its board objects", () => {
    const u = createUser("Probe", "p@x.com", "password123")!;
    const orgId = ensurePersonalOrg(u.id);
    const board = createLayout("Lobby", {
      schemaVersion: 3, name: "Lobby",
      rows: [{ id: "r1", blocks: [{ id: "h1", name: "Sign", type: "heading", props: { content: "Open" } }] }],
    } as any, { userId: u.id, orgId });
    console.log("board.orgId =", board.orgId, "| userId =", u.id, "| orgId =", orgId);
    console.log("getOwnedLayout(id, orgId)  ->", !!getOwnedLayout(board.id, orgId));
    console.log("getOwnedLayout(id, userId) ->", !!getOwnedLayout(board.id, u.id), "  <-- what engine loadBoard() does");
    const r = dryRunAutomation({ id: "a1", name: "n", trigger: { kind: "tick" }, conditions: null, actions: [] } as any, u.id, board.id);
    console.log("dryRun ctx.objects keys ->", JSON.stringify(Object.keys(r.context.objects)));
    expect(true).toBe(true);
  });
});
