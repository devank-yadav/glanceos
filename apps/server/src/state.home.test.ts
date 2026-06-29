import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-homeboard-"));
const { migrate } = await import("./db");
migrate();
const { createUser, setUserHomeLayout, getUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout } = await import("./layouts");
const { currentLayoutId } = await import("./state");
type DeviceRow = import("./devices").DeviceRow;

// #147 — a user's personal "home board" resolves on their own screens that have no board of
// their own, but ONLY when the board belongs to the screen's org (no cross-org exposure).
describe("#147 home board resolution", () => {
  const user = createUser("HB", "hb@example.com", "pw-12345678")!;
  const org = ensurePersonalOrg(user.id);
  const layout = createLayout("My glance", blankDocument("My glance"), { userId: user.id, orgId: org });
  // currentLayoutId only reads these fields; cast a minimal row.
  const mkDevice = (over: Partial<DeviceRow>): DeviceRow =>
    ({ id: "dev1", user_id: user.id, org_id: org, layout_id: null, group_id: null, timezone: null, ...over } as unknown as DeviceRow);

  it("resolves nothing until a home board is set", () => {
    expect(currentLayoutId(mkDevice({}))).toBeNull();
  });

  it("shows the home board on the user's screen with no board of its own", () => {
    setUserHomeLayout(user.id, layout.id);
    expect(currentLayoutId(mkDevice({}))).toBe(layout.id);
  });

  it("a device's own board still wins over the home board", () => {
    expect(currentLayoutId(mkDevice({ layout_id: 4242 }))).toBe(4242);
  });

  it("does NOT leak the home board to a screen in a different org", () => {
    expect(currentLayoutId(mkDevice({ org_id: "some-other-org" }))).toBeNull();
  });

  it("clears with null", () => {
    setUserHomeLayout(user.id, null);
    expect(getUser(user.id)!.homeLayoutId).toBeNull();
    expect(currentLayoutId(mkDevice({}))).toBeNull();
  });
});
