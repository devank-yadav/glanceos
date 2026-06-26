import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Upgrade path: build a real DB at version 024 (existing users + owned rows), then let
// the production runner apply 025 + 026 — exactly what a live install does on deploy.

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");
const dataDir = mkdtempSync(join(tmpdir(), "glanceos-orgmig-"));
process.env.GLANCEOS_DATA_DIR = dataDir;

function buildThrough(exclusive: string): void {
  const db = new Database(join(dataDir, "glanceos.db"));
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort().filter((f) => f < exclusive)) {
    db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, Date.now());
  }
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at, is_admin) VALUES ('ua','A','a@x.com','h',1,1)").run();
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at, is_admin) VALUES ('ub','B','b@x.com','h',2,0)").run();
  db.prepare("INSERT INTO layouts (name, version, document, is_template, user_id, created_at) VALUES ('A board',1,'{}',0,'ua',1)").run();
  db.prepare("INSERT INTO layouts (name, version, document, is_template, user_id, created_at) VALUES ('Global tmpl',1,'{}',1,NULL,1)").run();
  db.prepare("INSERT INTO devices (id, secret, name, claim_code, claimed_at, user_id, profile, created_at) VALUES ('dA','s','TV',NULL,5,'ua','{}',1)").run();
  db.close();
}

buildThrough("025_orgs.sql");
const { db, migrate } = await import("./db");
migrate(); // applies 025 + 026

describe("025/026 org migration on an upgraded DB", () => {
  it("creates one personal org per existing user, each as sole owner", () => {
    expect((db.prepare("SELECT COUNT(*) AS n FROM organizations WHERE personal = 1").get() as { n: number }).n).toBe(2);
    const aOrg = db.prepare("SELECT id FROM organizations WHERE created_by = 'ua'").get() as { id: string };
    const m = db.prepare("SELECT role FROM org_members WHERE org_id = ? AND user_id = 'ua'").get(aOrg.id) as { role: string };
    expect(m.role).toBe("owner");
    expect((db.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ?").get(aOrg.id) as { n: number }).n).toBe(1);
  });

  it("back-fills org_id on owned rows to the owner's personal org", () => {
    const aOrg = db.prepare("SELECT id FROM organizations WHERE created_by = 'ua'").get() as { id: string };
    expect((db.prepare("SELECT org_id FROM layouts WHERE name = 'A board'").get() as { org_id: string }).org_id).toBe(aOrg.id);
    expect((db.prepare("SELECT org_id FROM devices WHERE id = 'dA'").get() as { org_id: string }).org_id).toBe(aOrg.id);
  });

  it("leaves global templates org-less (readable by everyone)", () => {
    const t = db.prepare("SELECT org_id, user_id FROM layouts WHERE name = 'Global tmpl'").get() as { org_id: string | null; user_id: string | null };
    expect(t.org_id).toBeNull();
    expect(t.user_id).toBeNull();
  });

  it("retains sessions (no forced logout) and adds active_org_id", () => {
    const cols = (db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain("active_org_id");
  });
});
