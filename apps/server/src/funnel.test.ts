import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-funnel-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { hmacSign } = await import("./secrets");

migrate();
const app = buildApp();

const cookieOf = (r: Response): string => `glanceos_session=${/glanceos_session=([a-f0-9]+)/.exec(r.headers.get("set-cookie") ?? "")![1]}`;
const authed = (cookie: string, body?: unknown) => {
  const token = /glanceos_session=([a-f0-9]+)/.exec(cookie)![1];
  return { ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), cookie, "x-csrf-token": hmacSign(`csrf:${token}`) } as Record<string, string> };
};

// First registered account is the admin (can read founder metrics).
const admin = cookieOf(await app.request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Founder", email: "f@x.com", password: "password123" }), headers: { "content-type": "application/json" } }));

describe("activation funnel", () => {
  it("emits signup + first_board_created and surfaces them in admin metrics", async () => {
    await app.request("/api/layouts", { method: "POST", ...authed(admin, { name: "First board" }) });
    const m = await (await app.request("/api/admin/metrics", { headers: { cookie: admin } })).json();
    expect(m.funnel.signup).toBeGreaterThanOrEqual(1);
    expect(m.funnel.first_board_created).toBeGreaterThanOrEqual(1);
    expect(m.active.dau).toBeGreaterThanOrEqual(1);
  });

  it("gates the metrics endpoint to admins", async () => {
    const member = cookieOf(await app.request("/api/auth/register", { method: "POST", body: JSON.stringify({ name: "Member", email: "m@x.com", password: "password123" }), headers: { "content-type": "application/json" } }));
    expect((await app.request("/api/admin/metrics", { headers: { cookie: member } })).status).toBe(403);
  });

  it("stamps onboarded_at via the account endpoint", async () => {
    await app.request("/api/account/onboarded", { method: "POST", ...authed(admin) });
    const status = await (await app.request("/api/auth/status", { headers: { cookie: admin } })).json();
    expect(status.user.onboardedAt).toBeGreaterThan(0);
  });
});
