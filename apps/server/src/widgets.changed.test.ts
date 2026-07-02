import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-wchanged-"));
const { migrate } = await import("./db");
migrate();
const { resolveWidgetData } = await import("./widgets");

// #79 — the reserved __changed key: which badge-opted blocks moved since this screen last looked.
describe("#79 changed-badge resolution", () => {
  const board = (a: string, b: string): LayoutT =>
    ({ schemaVersion: 3, name: "x", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top",
       rows: [{ id: "r", h: 4, blocks: [
         { id: "badged", type: "stat", width: 1, props: { label: "PRs", value: a }, changeBadge: true },
         { id: "plain", type: "stat", width: 1, props: { label: "Inbox", value: b } },
       ] }] }) as unknown as LayoutT;

  it("flags only badged blocks, only when their value moved, never on the baseline", async () => {
    const key = "dev:changed-test";
    const first = await resolveWidgetData(board("3", "5"), "u1", undefined, undefined, key);
    expect(first["__changed"]).toBeUndefined(); // first look → baseline

    const second = await resolveWidgetData(board("7", "9"), "u1", undefined, undefined, key);
    expect(second["__changed"]).toEqual(["badged"]); // both moved, only the badged one is flagged

    const third = await resolveWidgetData(board("7", "9"), "u1", undefined, undefined, key);
    expect(third["__changed"]).toBeUndefined(); // nothing moved since the last look
  });

  it("no badges on the board → no __changed key at all", async () => {
    const plain = ({ schemaVersion: 3, name: "x", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top",
      rows: [{ id: "r", h: 4, blocks: [{ id: "p", type: "stat", width: 1, props: { label: "X", value: "1" } }] }] }) as unknown as LayoutT;
    const key = "dev:changed-none";
    await resolveWidgetData(plain, "u1", undefined, undefined, key);
    const out = await resolveWidgetData(plain, "u1", undefined, undefined, key);
    expect(out["__changed"]).toBeUndefined();
  });
});
