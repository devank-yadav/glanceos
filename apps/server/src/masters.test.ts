import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-masters-"));
const { migrate } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { createMaster, updateMaster, deleteMaster, listMasters, mastersMapForOrg } = await import("./masters");
const { expandInstances } = await import("@glanceos/schema");

const user = createUser("Master", `master-${Date.now()}@example.com`, "calm-glass-2")!;
const org = ensurePersonalOrg(user.id);

describe("#84 master blocks + instance expansion", () => {
  it("creates a master and exposes it in the org map", () => {
    const m = createMaster(user.id, org, { name: "Meeting card", type: "callout", props: { text: "Hi", tone: "info" }, style: { invert: true } })!;
    expect(m.type).toBe("callout");
    expect(mastersMapForOrg(org).get(m.id)).toEqual({ type: "callout", props: { text: "Hi", tone: "info" }, style: { invert: true } });
  });

  it("expandInstances replaces an instance with its master, keeping id + width + link", () => {
    const m = createMaster(user.id, org, { name: "Card", type: "stat", props: { label: "Temp", value: "21" } })!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = { rows: [{ id: "r", h: 6, blocks: [{ id: "inst", type: "divider", width: 2, props: {}, instanceOf: m.id }] }] };
    const out = expandInstances(doc, mastersMapForOrg(org));
    const b = out.rows[0].blocks[0];
    expect(b.id).toBe("inst");        // placement preserved
    expect(b.width).toBe(2);
    expect(b.type).toBe("stat");      // type from master
    expect(b.props).toEqual({ label: "Temp", value: "21" });
    expect(b.instanceOf).toBe(m.id);  // still linked
  });

  it("a missing master leaves the instance untouched (same object, no crash)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = { rows: [{ id: "r", h: 6, blocks: [{ id: "x", type: "divider", width: 1, props: {}, instanceOf: "gone" }] }] };
    const out = expandInstances(doc, mastersMapForOrg(org));
    expect(out).toBe(doc); // no instances expanded → same reference (cheap for ordinary boards)
    expect(out.rows[0].blocks[0].type).toBe("divider");
  });

  it("expands across pages and zones too", () => {
    const m = createMaster(user.id, org, { name: "Z", type: "stat", props: { value: "9" } })!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = {
      rows: [],
      pages: [[{ id: "p", h: 6, blocks: [{ id: "pi", type: "divider", width: 1, props: {}, instanceOf: m.id }] }]],
      zones: [{ rect: { x: 0, y: 0, w: 1, h: 1 }, rows: [{ id: "z", h: 6, blocks: [{ id: "zi", type: "divider", width: 1, props: {}, instanceOf: m.id }] }] }],
    };
    const out = expandInstances(doc, mastersMapForOrg(org));
    expect(out.pages[0][0].blocks[0].type).toBe("stat");
    expect(out.zones[0].rows[0].blocks[0].type).toBe("stat");
  });

  it("update changes the map; delete + org isolation", () => {
    const m = createMaster(user.id, org, { name: "U", type: "callout", props: { text: "a" } })!;
    expect(updateMaster(m.id, org, { props: { text: "b" } })).toBe(true);
    expect((mastersMapForOrg(org).get(m.id)!.props as { text: string }).text).toBe("b");
    expect(updateMaster(m.id, "other-org", { props: {} })).toBe(false);
    expect(deleteMaster(m.id, "other-org")).toBe(false);
    expect(deleteMaster(m.id, org)).toBe(true);
    expect(listMasters(org).find((x) => x.id === m.id)).toBeUndefined();
  });
});
