import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-lowbatt-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { blankDocument, createLayout } = await import("./layouts");
const { currentLayoutId } = await import("./state");
type DeviceRow = import("./devices").DeviceRow;

// #58 — when battery is at/below the configured threshold, the device's normal board is replaced
// by the user's designated minimal board (own-org only). The swap wins over every normal board.
describe("#58 low-battery board swap", () => {
  const user = createUser("LB", "lb@example.com", "pw-12345678")!;
  const org = ensurePersonalOrg(user.id);
  const low = createLayout("Low battery", blankDocument("Low battery"), { userId: user.id, orgId: org });
  const profile = (lb?: { layoutId: number; pct: number }) => JSON.stringify({ width: 800, height: 480, ...(lb ? { lowBattery: lb } : {}) });
  const mkDevice = (over: Partial<DeviceRow>): DeviceRow =>
    ({ id: "d", user_id: user.id, org_id: org, layout_id: 999, group_id: null, timezone: null, battery: null, profile: profile(), ...over } as unknown as DeviceRow);

  it("swaps to the low board at/below the threshold", () => {
    expect(currentLayoutId(mkDevice({ profile: profile({ layoutId: low.id, pct: 15 }), battery: 12 }))).toBe(low.id);
    expect(currentLayoutId(mkDevice({ profile: profile({ layoutId: low.id, pct: 15 }), battery: 15 }))).toBe(low.id); // inclusive
  });

  it("keeps the normal board above the threshold", () => {
    expect(currentLayoutId(mkDevice({ profile: profile({ layoutId: low.id, pct: 15 }), battery: 40 }))).toBe(999);
  });

  it("does nothing without a battery reading or without config", () => {
    expect(currentLayoutId(mkDevice({ profile: profile({ layoutId: low.id, pct: 15 }), battery: null }))).toBe(999);
    expect(currentLayoutId(mkDevice({ battery: 3 }))).toBe(999); // no lowBattery in profile
  });

  it("never leaks a board from another org (cross-org guard)", () => {
    // The low board belongs to `org`; a screen in another org with no board of its own gets null.
    expect(currentLayoutId(mkDevice({ org_id: "other-org", layout_id: null, profile: profile({ layoutId: low.id, pct: 15 }), battery: 5 }))).toBeNull();
  });
});
