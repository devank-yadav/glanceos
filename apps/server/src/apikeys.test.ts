import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-apikeys-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { createUser } = await import("./auth");
const { mintKey, listKeys, revokeKey, resolveKey, isScope } = await import("./apikeys");
const { ensurePersonalOrg } = await import("./orgs");

migrate();
const app = buildApp();
const user = createUser("Keyholder", "keys@example.com", "password123")!;
const org = ensurePersonalOrg(user.id);

const bearer = (token: string, body?: unknown) => ({
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  headers: {
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    authorization: `Bearer ${token}`,
  } as Record<string, string>,
});

describe("apikeys module", () => {
  it("mints a gos_ token, stores only the hash, and resolves it to owner+scopes", () => {
    const { token, key } = mintKey(user.id, org, "CI", ["tasks:read", "tasks:write"]);
    expect(token.startsWith("gos_")).toBe(true);
    expect(key.prefix).toBe(token.slice(0, 12));
    expect(key.scopes.sort()).toEqual(["tasks:read", "tasks:write"]);
    const resolved = resolveKey(token);
    expect(resolved).toEqual({ userId: user.id, orgId: org, scopes: ["tasks:read", "tasks:write"] });
    expect(listKeys(user.id).some((k) => k.id === key.id)).toBe(true);
  });

  it("rejects unknown and revoked tokens", () => {
    const { token, key } = mintKey(user.id, org, "throwaway", ["tasks:read"]);
    expect(resolveKey("gos_nope")).toBeNull();
    expect(resolveKey("not-even-prefixed")).toBeNull();
    expect(revokeKey(key.id, user.id)).toBe(true);
    expect(resolveKey(token)).toBeNull(); // gone after revoke
    expect(revokeKey(key.id, user.id)).toBe(false); // idempotent
  });

  it("validates scope strings", () => {
    expect(isScope("tasks:write")).toBe(true);
    expect(isScope("tasks:delete")).toBe(false);
  });
});

describe("Bearer guard (CSRF-immune, scope-gated, deny-by-default)", () => {
  it("a tasks:write key POSTs a task with NO CSRF token", async () => {
    const { token } = mintKey(user.id, org, "writer", ["tasks:write"]);
    const res = await app.request("/api/tasks", { method: "POST", ...bearer(token, { listId: "default", text: "from a key" }) });
    expect(res.status).toBe(201);
  });

  it("a tasks:read key is refused on a write (403, missing scope)", async () => {
    const { token } = mintKey(user.id, org, "reader", ["tasks:read"]);
    const res = await app.request("/api/tasks", { method: "POST", ...bearer(token, { listId: "default", title: "nope" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/tasks:write/);
  });

  it("a read key can still GET tasks", async () => {
    const { token } = mintKey(user.id, org, "reader2", ["tasks:read"]);
    const res = await app.request("/api/tasks?listId=default", { ...bearer(token) });
    expect(res.status).toBe(200);
  });

  it("an invalid key is 401", async () => {
    const res = await app.request("/api/tasks?listId=default", { ...bearer("gos_garbage") });
    expect(res.status).toBe(401);
  });

  it("a key cannot reach a non-allowlisted endpoint, even with broad scopes (403)", async () => {
    const { token } = mintKey(user.id, org, "broad", ["tasks:write", "layouts:read", "devices:read"]);
    // key management is session-only — absent from the allowlist
    const res = await app.request("/api/account/api-keys", { ...bearer(token) });
    expect(res.status).toBe(403);
  });

  it("a layouts:read key can list layouts but not create one", async () => {
    const { token } = mintKey(user.id, org, "ro", ["layouts:read"]);
    expect((await app.request("/api/layouts", { ...bearer(token) })).status).toBe(200);
    const create = await app.request("/api/layouts", { method: "POST", ...bearer(token, { name: "x" }) });
    expect(create.status).toBe(403); // POST /api/layouts isn't in the allowlist at all
  });
});
