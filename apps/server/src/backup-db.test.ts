import Database from "better-sqlite3";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pruneSnapshots, snapshotDatabase } from "./backup-db";
import { migrate } from "./db";

migrate();
const dir = join(tmpdir(), `glo-backup-${process.pid}-${Date.now()}`);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("db backup", () => {
  it("snapshotDatabase writes a valid, queryable SQLite copy", async () => {
    const p = await snapshotDatabase(dir);
    expect(existsSync(p)).toBe(true);
    const snap = new Database(p, { readonly: true });
    expect(snap.pragma("integrity_check", { simple: true })).toBe("ok");
    const n = snap.prepare("SELECT count(*) c FROM _migrations").get() as { c: number };
    expect(n.c).toBeGreaterThan(0); // migrations made it into the snapshot
    snap.close();
  });

  it("pruneSnapshots keeps only the newest N", () => {
    for (let i = 0; i < 5; i++) writeFileSync(join(dir, `glanceos-2020-01-0${i}_00-00-00.db`), "x");
    const before = readdirSync(dir).filter((f) => f.endsWith(".db")).length;
    expect(before).toBeGreaterThanOrEqual(6);
    const removed = pruneSnapshots(3, dir);
    const after = readdirSync(dir).filter((f) => f.endsWith(".db")).length;
    expect(after).toBe(3);
    expect(removed).toBe(before - 3);
  });
});
