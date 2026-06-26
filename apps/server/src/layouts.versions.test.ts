import { describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { migrate } from "./db";
import {
  blankDocument, createLayout, getLayoutVersionDocument, listLayoutVersions, updateLayout,
} from "./layouts";
import { ensurePersonalOrg } from "./orgs";

migrate();
const user = createUser("Ver Tester", `ver-${Date.now()}@example.com`, "calm-glass-2")!;
const org = ensurePersonalOrg(user.id);
const MIN = 6 * 60_000; // > the default version throttle, so each save snapshots

describe("board version history", () => {
  it("archives the replaced document on each (throttle-spaced) save and restores it", () => {
    const layout = createLayout("D0", blankDocument("D0"), { userId: user.id, orgId: org });
    updateLayout(layout.id, blankDocument("D1"), 1_000_000);        // archives D0
    updateLayout(layout.id, blankDocument("D2"), 1_000_000 + MIN);  // archives D1

    const versions = listLayoutVersions(layout.id, org);
    expect(versions.length).toBe(2);
    expect(versions[0]!.summary).toBe("D1"); // newest first
    expect(versions[1]!.summary).toBe("D0");

    // restore the oldest (D0)
    const oldest = getLayoutVersionDocument(layout.id, versions[1]!.id, org);
    expect(oldest?.name).toBe("D0");
    const restored = updateLayout(layout.id, oldest!, 1_000_000 + 2 * MIN);
    expect(restored?.document.name).toBe("D0");
  });

  it("throttles rapid saves to one snapshot", () => {
    const layout = createLayout("R0", blankDocument("R0"), { userId: user.id, orgId: org });
    updateLayout(layout.id, blankDocument("R1"), 2_000_000);       // archives R0
    updateLayout(layout.id, blankDocument("R2"), 2_000_000 + 100); // within throttle → skipped
    expect(listLayoutVersions(layout.id, org).length).toBe(1);
  });

  it("only the owner can see a board's versions", () => {
    const layout = createLayout("P0", blankDocument("P0"), { userId: user.id, orgId: org });
    updateLayout(layout.id, blankDocument("P1"), 3_000_000);
    expect(listLayoutVersions(layout.id, "not-the-owner")).toEqual([]);
    expect(getLayoutVersionDocument(layout.id, 999999, "not-the-owner")).toBeUndefined();
  });
});
