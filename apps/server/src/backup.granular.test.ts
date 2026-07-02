import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-granular-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout } = await import("./layouts");
const { addTask, listTasks } = await import("./tasks");
const { setCustomData, setDataPrivacy } = await import("./customdata");
const { captureScene } = await import("./scenes");
const { dumpUser, importUser } = await import("./backup");

const u = createUser("Gran", "granular@example.com", "password123")!;
const org = ensurePersonalOrg(u.id);
createLayout("Wall", blankDocument("Wall"), { userId: u.id, orgId: org });
addTask(u.id, "default", "water the plants");
setCustomData(u.id, "steps", 5000);
setDataPrivacy(u.id, "steps", true);
captureScene(u.id, org, "Evening");

// #173 — granular export: pick sections; replace-mode import only wipes what the file carries.
describe("#173 granular export", () => {
  it("a boards-only dump carries layouts and nothing else", () => {
    const d = dumpUser(u.id, org, ["boards"]);
    expect(Array.isArray(d.layouts)).toBe(true);
    expect((d.layouts as unknown[]).length).toBe(1);
    expect(d.tasks).toBeUndefined();
    expect(d.connections).toBeUndefined();
    expect(d.data).toBeUndefined();
    expect(d.sections).toEqual(["boards"]);
  });

  it("the full dump now carries the sections the old backup never had (with privacy flags)", () => {
    const d = dumpUser(u.id, org);
    const data = d.data as Array<{ key: string; private: number }>;
    expect(data.some((r) => r.key === "steps" && r.private === 1)).toBe(true);
    expect((d.scenes as unknown[]).length).toBe(1);
    expect(Array.isArray(d.automations)).toBe(true);
    expect(Array.isArray(d.journal)).toBe(true);
  });

  it("replace-mode import of a boards-only file does NOT wipe tasks or connections", () => {
    const boardsOnly = dumpUser(u.id, org, ["boards"]);
    const res = importUser(u.id, org, boardsOnly, { mode: "replace" });
    expect(res.layouts).toBe(1);
    expect(listTasks(u.id, "default").length).toBe(1); // the task survived the "replace"
  });

  it("replace-mode with a full file still replaces tasks", () => {
    const full = dumpUser(u.id, org); // carries the 1 existing task
    addTask(u.id, "default", "extra task that the restore should erase");
    const res = importUser(u.id, org, full, { mode: "replace" });
    expect(res.tasks).toBe(1);
    expect(listTasks(u.id, "default").map((t) => t.text)).toEqual(["water the plants"]);
  });
});
