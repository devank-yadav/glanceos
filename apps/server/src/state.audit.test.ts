import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-audit-"));
const { migrate } = await import("./db");
migrate();
const { createUser, setUserHomeLayout } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout } = await import("./layouts");
const { currentLayoutId, resolveLayoutWithReason } = await import("./state");
type DeviceRow = import("./devices").DeviceRow;

// #171 — the audit reads the REAL resolution ladder: every rung returns a reason tag,
// and currentLayoutId delegates, so the two can never disagree.
describe("#171 resolveLayoutWithReason (the tagged ladder)", () => {
  const user = createUser("Audit", "audit@example.com", "pw-12345678")!;
  const org = ensurePersonalOrg(user.id);
  const board = createLayout("Wall", blankDocument("Wall"), { userId: user.id, orgId: org });
  const minimal = createLayout("Battery saver", blankDocument("Battery saver"), { userId: user.id, orgId: org });
  const mkDevice = (over: Partial<DeviceRow>): DeviceRow =>
    ({ id: "adev1", user_id: user.id, org_id: org, layout_id: null, group_id: null, timezone: null, battery: null, profile: "{}", ...over } as unknown as DeviceRow);

  it("nothing assigned anywhere → none", () => {
    expect(resolveLayoutWithReason(mkDevice({}))).toEqual({ layoutId: null, reason: "none" });
  });

  it("the device's own board → deviceBoard", () => {
    expect(resolveLayoutWithReason(mkDevice({ layout_id: board.id }))).toEqual({ layoutId: board.id, reason: "deviceBoard" });
  });

  it("home board fills a bare screen → homeBoard; the device's own board outranks it", () => {
    setUserHomeLayout(user.id, board.id);
    expect(resolveLayoutWithReason(mkDevice({}))).toEqual({ layoutId: board.id, reason: "homeBoard" });
    expect(resolveLayoutWithReason(mkDevice({ layout_id: minimal.id })).reason).toBe("deviceBoard");
    setUserHomeLayout(user.id, null);
  });

  it("a critical battery + configured swap outranks everything → lowBattery", () => {
    const d = mkDevice({ layout_id: board.id, battery: 4, profile: JSON.stringify({ lowBattery: { layoutId: minimal.id, pct: 10 } }) });
    expect(resolveLayoutWithReason(d)).toEqual({ layoutId: minimal.id, reason: "lowBattery" });
  });

  it("currentLayoutId is the same ladder (delegation, not a copy)", () => {
    const d = mkDevice({ layout_id: board.id });
    expect(currentLayoutId(d)).toBe(resolveLayoutWithReason(d).layoutId);
  });
});
