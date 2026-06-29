import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-scenes-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { getCustomData, setCustomData } = await import("./customdata");
const { listScenes, captureScene, applyScene, deleteScene, renameScene } = await import("./scenes");

const user = createUser("Scene", `scene-${Date.now()}@example.com`, "calm-glass-2")!;
const org = ensurePersonalOrg(user.id);

describe("#3 scenes", () => {
  it("captures the current data values and re-applies them after they change", () => {
    setCustomData(user.id, "status", "Focusing");
    setCustomData(user.id, "n", 5);
    const s = captureScene(user.id, org, "Focus")!;
    expect(s.keyCount).toBe(2);
    setCustomData(user.id, "status", "Away");
    setCustomData(user.id, "n", 99);
    expect(applyScene(s.id, user.id)).toBe(2);
    expect(getCustomData(user.id, "status")).toBe("Focusing");
    expect(getCustomData(user.id, "n")).toBe(5);
  });

  it("merges — keys added after capture are left untouched by apply", () => {
    const s = captureScene(user.id, org, "Snap")!;
    setCustomData(user.id, "newkey", "later");
    applyScene(s.id, user.id);
    expect(getCustomData(user.id, "newkey")).toBe("later");
  });

  it("rejects a blank name, isolates by user, renames and deletes", () => {
    expect(captureScene(user.id, org, "   ")).toBeNull();
    const s = captureScene(user.id, org, "Mine")!;
    expect(applyScene(s.id, "someone-else")).toBe(-1);
    expect(deleteScene(s.id, "someone-else")).toBe(false);
    expect(renameScene(s.id, "someone-else", "x")).toBe(false);
    expect(renameScene(s.id, user.id, "Renamed")).toBe(true);
    expect(listScenes(user.id).find((x) => x.id === s.id)!.name).toBe("Renamed");
    expect(deleteScene(s.id, user.id)).toBe(true);
    expect(listScenes(user.id).find((x) => x.id === s.id)).toBeUndefined();
  });
});
