import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Builds a real v0.1 database (001+002 applied, legacy single-password data),
// then lets the production migration runner apply 003 — the upgrade path a
// real install takes.

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const dataDir = mkdtempSync(join(tmpdir(), "glanceos-migrate-"));
process.env.GLANCEOS_DATA_DIR = dataDir;

const LEGACY_DOC = JSON.stringify({
  schemaVersion: 1,
  name: "Old desk",
  grid: { columns: 2, rows: 2, gap: 1 },
  widgets: [{ id: "w1", type: "clock", area: { col: 1, row: 1 }, props: {} }],
});

function buildLegacyDb(): void {
  const db = new Database(join(dataDir, "glanceos.db"));
  db.exec("CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  for (const file of ["001_init.sql", "002_auth.sql"]) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, Date.now());
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('password_hash', 'deadbeef:cafef00d')").run();
  db.prepare(
    "INSERT INTO layouts (name, version, document, is_template, created_at) VALUES ('Old desk', 7, ?, 0, 1)",
  ).run(LEGACY_DOC);
  db.prepare(
    "INSERT INTO layouts (name, version, document, is_template, created_at) VALUES ('Old template', 1, ?, 1, 1)",
  ).run(LEGACY_DOC);
  db.prepare(
    "INSERT INTO devices (id, secret, name, claim_code, claimed_at, layout_id, profile, created_at) VALUES ('dev1', 's3cret', 'Wall TV', NULL, 123, 1, '{}', 1)",
  ).run();
  db.prepare("INSERT INTO sessions (token, created_at, expires_at) VALUES ('oldtoken', 1, 9999999999999)").run();
  db.prepare("UPDATE queues SET now_serving = 3, waiting = 2 WHERE id = 'default'").run();
  db.close();
}

buildLegacyDb();
const { db, migrate } = await import("./db");
migrate();

describe("003 migration on a real v0.1 database", () => {
  const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@local'").get() as {
    id: string;
    password_hash: string;
  };

  it("turns the legacy password into the admin@local user, hash intact", () => {
    expect(admin).toBeDefined();
    expect(admin.password_hash).toBe("deadbeef:cafef00d");
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(1);
  });

  it("attaches claimed devices and user layouts to admin", () => {
    const device = db.prepare("SELECT user_id FROM devices WHERE id = 'dev1'").get() as { user_id: string };
    expect(device.user_id).toBe(admin.id);
    const layout = db.prepare("SELECT user_id, published FROM layouts WHERE name = 'Old desk'").get() as {
      user_id: string;
      published: number;
    };
    expect(layout.user_id).toBe(admin.id);
    expect(layout.published).toBe(0);
  });

  it("publishes builtins with no owner", () => {
    const template = db.prepare("SELECT user_id, published FROM layouts WHERE name = 'Old template'").get() as {
      user_id: string | null;
      published: number;
    };
    expect(template.user_id).toBeNull();
    expect(template.published).toBe(1);
  });

  it("migrates the legacy tasks and queue under admin", () => {
    const tasks = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?").get(admin.id) as { n: number };
    expect(tasks.n).toBeGreaterThan(0); // 001's seed rows survive, owned
    const queue = db.prepare("SELECT now_serving, waiting FROM queues WHERE user_id = ? AND id = 'default'").get(admin.id);
    expect(queue).toMatchObject({ now_serving: 3, waiting: 2 });
  });

  it("recreates sessions empty, with the user_id column", () => {
    expect((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n).toBe(0);
    const cols = (db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain("user_id");
  });

  it("clears the legacy password setting", () => {
    expect(db.prepare("SELECT 1 FROM settings WHERE key = 'password_hash'").get()).toBeUndefined();
  });
});
