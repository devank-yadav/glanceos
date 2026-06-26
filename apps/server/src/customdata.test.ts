import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-customdata-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { createUser } = await import("./auth");
const { mintKey } = await import("./apikeys");
const { ensurePersonalOrg } = await import("./orgs");
const {
  setCustomData, getCustomData, listCustomData, deleteCustomData, customDataWidget, MAX_VALUE_BYTES, MAX_KEYS_PER_USER,
} = await import("./customdata");

migrate();
const app = buildApp();
const user = createUser("Dataowner", "data@example.com", "password123")!;
const org = ensurePersonalOrg(user.id);

describe("customdata module", () => {
  it("round-trips JSON values and lists them newest-first", () => {
    expect(setCustomData(user.id, "temp", 21.5).ok).toBe(true);
    expect(setCustomData(user.id, "status", { open: true, queue: 3 }).ok).toBe(true);
    expect(getCustomData(user.id, "temp")).toBe(21.5);
    expect(getCustomData(user.id, "status")).toEqual({ open: true, queue: 3 });
    expect(getCustomData(user.id, "missing")).toBeUndefined();
    const all = listCustomData(user.id);
    expect(all.map((e) => e.key)).toContain("temp");
    expect(all[0]!.key).toBe("status"); // most recently written
  });

  it("upserts (overwrites) an existing key without growing the count", () => {
    setCustomData(user.id, "temp", 30);
    expect(getCustomData(user.id, "temp")).toBe(30);
  });

  it("rejects oversized values and bad keys", () => {
    const huge = "x".repeat(MAX_VALUE_BYTES + 1);
    expect(setCustomData(user.id, "big", huge)).toEqual({ ok: false, error: "too_large" });
    expect(setCustomData(user.id, "   ", 1)).toEqual({ ok: false, error: "bad_key" });
  });

  it("enforces the per-user key cap (new keys only)", () => {
    const u = createUser("Capped", "cap@example.com", "password123")!;
    for (let i = 0; i < MAX_KEYS_PER_USER; i++) expect(setCustomData(u.id, `k${i}`, i).ok).toBe(true);
    expect(setCustomData(u.id, "one-too-many", 1)).toEqual({ ok: false, error: "too_many_keys" });
    expect(setCustomData(u.id, "k0", 999).ok).toBe(true); // existing key still writable
  });

  it("customDataWidget resolves value / no-data / null-when-unconfigured", () => {
    setCustomData(user.id, "shown", "hello");
    expect(customDataWidget({ key: "shown" }, user.id)).toEqual({ value: "hello" });
    expect(customDataWidget({ key: "never-set" }, user.id)).toEqual({ error: "no data" });
    expect(customDataWidget({ key: "" }, user.id)).toBeNull();
  });

  it("deletes a key", () => {
    setCustomData(user.id, "gone", 1);
    expect(deleteCustomData(user.id, "gone")).toBe(true);
    expect(getCustomData(user.id, "gone")).toBeUndefined();
    expect(deleteCustomData(user.id, "gone")).toBe(false);
  });
});

describe("/api/data routes", () => {
  const bearer = (token: string, body?: unknown) => ({
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), authorization: `Bearer ${token}` } as Record<string, string>,
  });

  it("a data:write key POSTs a value with NO CSRF, and it renders via the block", async () => {
    const { token } = mintKey(user.id, org, "writer", ["data:write"]);
    const res = await app.request("/api/data/sensor", { method: "POST", ...bearer(token, { value: 42 }) });
    expect(res.status).toBe(201);
    expect(customDataWidget({ key: "sensor" }, user.id)).toEqual({ value: 42 });
  });

  it("POST requires a value field", async () => {
    const { token } = mintKey(user.id, org, "writer2", ["data:write"]);
    const res = await app.request("/api/data/x", { method: "POST", ...bearer(token, { notvalue: 1 }) });
    expect(res.status).toBe(400);
  });

  it("GET /api/data is NOT reachable with a key (deny-by-default), only POST is", async () => {
    const { token } = mintKey(user.id, org, "writer3", ["data:write"]);
    const res = await app.request("/api/data", { ...bearer(token) });
    expect(res.status).toBe(403);
  });

  it("a key without data:write is refused", async () => {
    const { token } = mintKey(user.id, org, "noscope", ["tasks:read"]);
    const res = await app.request("/api/data/y", { method: "POST", ...bearer(token, { value: 1 }) });
    expect(res.status).toBe(403);
  });
});
