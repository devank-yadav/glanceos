import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Set GLANCEOS_VERSION_KEEP small BEFORE importing layouts, so the prune keeps only 2
// unlabeled versions — enough to prove a LABELED version survives beyond the keep window.
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-vlabel-"));
process.env.GLANCEOS_VERSION_KEEP = "2";
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout, updateLayout, listLayoutVersions, setVersionLabel } = await import("./layouts");

const user = createUser("VL", `vl-${Date.now()}@example.com`, "calm-glass-2")!;
const org = ensurePersonalOrg(user.id);
const MIN = 6 * 60_000; // > the version throttle, so each save snapshots

describe("#95 named versions", () => {
  it("names a version, lists the label, and a labeled version survives the prune", () => {
    const L = createLayout("L0", blankDocument("L0"), { userId: user.id, orgId: org });
    updateLayout(L.id, blankDocument("L1"), 1_000_000); // archives L0 → [L0]
    const v0 = listLayoutVersions(L.id, org)[0]!;
    expect(setVersionLabel(L.id, v0.id, org, "before redesign")).toBe(true);
    expect(listLayoutVersions(L.id, org).find((v) => v.id === v0.id)!.label).toBe("before redesign");

    updateLayout(L.id, blankDocument("L2"), 1_000_000 + MIN);     // archives L1
    updateLayout(L.id, blankDocument("L3"), 1_000_000 + 2 * MIN); // archives L2; prune keeps latest 2 UNLABELED

    const after = listLayoutVersions(L.id, org);
    // L0 is older than the keep-2 window but LABELED → still present (would be pruned otherwise).
    expect(after.find((v) => v.id === v0.id)?.label).toBe("before redesign");
  });

  it("clears a label (empty → null) and rejects a non-owner", () => {
    const L = createLayout("C0", blankDocument("C0"), { userId: user.id, orgId: org });
    updateLayout(L.id, blankDocument("C1"), 2_000_000);
    const v = listLayoutVersions(L.id, org)[0]!;
    setVersionLabel(L.id, v.id, org, "temp");
    expect(setVersionLabel(L.id, v.id, org, "")).toBe(true);
    expect(listLayoutVersions(L.id, org)[0]!.label).toBeNull();
    expect(setVersionLabel(L.id, v.id, "not-the-owner", "x")).toBe(false);
  });
});
