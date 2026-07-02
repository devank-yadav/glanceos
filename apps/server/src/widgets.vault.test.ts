import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LayoutT } from "@glanceos/schema";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-vault-"));
const { migrate } = await import("./db");
migrate();
const { resolveWidgetData } = await import("./widgets");
const { setCustomData, setDataPrivacy, isDataPrivate, listCustomData } = await import("./customdata");
const { setJournal } = await import("./journal");
const { createUser } = await import("./auth");

// #156 — the private data vault. A private key (and a journal entry, always) renders on the
// owner's OWN screens but never on a public share link / OG preview (publicView).
const board = (): LayoutT =>
  ({ schemaVersion: 3, name: "v", theme: { mode: "light", fontScale: "m" }, gap: 2, align: "top",
     rows: [{ id: "r", h: 4, blocks: [
       { id: "secret", type: "customData", width: 1, props: { key: "salary", label: "" } },
       { id: "open", type: "customData", width: 1, props: { key: "city", label: "" } },
       { id: "hist", type: "metricHistory", width: 1, props: { dataKey: "salary", label: "", days: 30 } },
       { id: "jn", type: "journal", width: 1, props: { label: "Reflection" } },
     ] }] }) as unknown as LayoutT;

describe("#156 private data vault", () => {
  const user = createUser("Vault", "vault@example.com", "password123")!;
  setCustomData(user.id, "salary", 90000); // numeric → also accumulates metric history (#27)
  setCustomData(user.id, "city", "Delhi");
  setDataPrivacy(user.id, "salary", true);
  setJournal(user.id, "2026-07-01", "a very personal thought", 1);

  it("privacy flag round-trips (list + isDataPrivate; missing key = not private)", () => {
    expect(isDataPrivate(user.id, "salary")).toBe(true);
    expect(isDataPrivate(user.id, "city")).toBe(false);
    expect(isDataPrivate(user.id, "never-set")).toBe(false);
    const listed = Object.fromEntries(listCustomData(user.id).map((e) => [e.key, e.private]));
    expect(listed).toMatchObject({ salary: true, city: false });
  });

  it("the owner's own screens render everything", async () => {
    const own = await resolveWidgetData(board(), user.id); // publicView defaults false
    expect(own["secret"]).toEqual({ value: 90000 });
    expect(own["open"]).toEqual({ value: "Delhi" });
    expect(own["hist"]).toEqual([90000]);
    expect(own["jn"]).toMatchObject({ entry: "a very personal thought" });
  });

  it("a public share omits the private key, its history, and the journal — but keeps public data", async () => {
    const pub = await resolveWidgetData(board(), user.id, undefined, undefined, undefined, true, true);
    expect(pub["secret"]).toBeUndefined(); // value never leaves
    expect(pub["hist"]).toBeUndefined(); // nor its recorded history
    expect(pub["jn"]).toBeUndefined(); // a reflection is inherently personal
    expect(pub["open"]).toEqual({ value: "Delhi" }); // non-private keys still render
  });

  it("un-marking restores public rendering", async () => {
    setDataPrivacy(user.id, "salary", false);
    const pub = await resolveWidgetData(board(), user.id, undefined, undefined, undefined, true, true);
    expect(pub["secret"]).toEqual({ value: 90000 });
    setDataPrivacy(user.id, "salary", true); // leave the fixture private
  });
});
