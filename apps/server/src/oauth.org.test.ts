import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-oauthorg-"));
process.env.GLANCEOS_RATE_LIMIT = "off";
const { migrate, db } = await import("./db");
migrate();
const { createUser } = await import("./auth");
const { ensurePersonalOrg } = await import("./orgs");
const { saveOAuthConnection } = await import("./oauth");
const { listConnections } = await import("./connections");
const { buildApp } = await import("./api");

const tokens = { access: "a", refresh: "r", expiresAt: Date.now() + 3_600_000 };

// A finished OAuth flow used to INSERT without org_id, while every read path filters on
// it — so the connection was saved, its tokens sealed, and then invisible in the app.
describe("OAuth connections belong to an org", () => {
  it("shows up in the workspace that started the flow", () => {
    const u = createUser("OA", "oa@example.com", "password123")!;
    const org = ensurePersonalOrg(u.id);
    const id = saveOAuthConnection(u.id, "google", tokens, org);
    expect(listConnections(org).map((c) => c.id)).toContain(id);
  });

  it("falls back to the personal org when the caller passes none", () => {
    const u = createUser("OA2", "oa2@example.com", "password123")!;
    const org = ensurePersonalOrg(u.id);
    saveOAuthConnection(u.id, "github", tokens);
    expect(listConnections(org).some((c) => c.provider === "github")).toBe(true);
  });

  it("adopts an existing org-less row instead of leaving it orphaned", () => {
    const u = createUser("OA3", "oa3@example.com", "password123")!;
    const org = ensurePersonalOrg(u.id);
    // a row as the old code wrote it: no org_id
    db.prepare(
      "INSERT INTO connections (id, user_id, provider, label, auth_kind, config, status, last_error, created_at, updated_at) VALUES ('legacy-1', ?, 'notion', 'Notion', 'oauth2', '{}', 'ok', '', 0, 0)",
    ).run(u.id);
    expect(listConnections(org).some((c) => c.id === "legacy-1")).toBe(false); // invisible, as shipped
    const id = saveOAuthConnection(u.id, "notion", tokens, org); // reconnect heals it
    expect(id).toBe("legacy-1");
    expect(listConnections(org).map((c) => c.id)).toContain("legacy-1");
    expect(listConnections(org).filter((c) => c.provider === "notion")).toHaveLength(1); // healed, not duplicated
  });
});

// /api/hooks/:secret was registered first and swallowed the literal /api/hooks/stripe,
// so the billing webhook could never run.
describe("the Stripe webhook is reachable", () => {
  it("is not swallowed by the parametric inlet route", async () => {
    const res = await buildApp().request("/api/hooks/stripe", {
      method: "POST", body: "{}", headers: { "content-type": "application/json" },
    });
    // the inlet route answers 404 "unknown inlet"; the stripe route answers 400 bad signature
    expect(res.status).toBe(400);
    expect((await res.json() as { error?: string }).error).toBe("bad signature");
  });
});
