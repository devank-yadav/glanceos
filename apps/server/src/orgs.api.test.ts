import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-orgs-api-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { hmacSign } = await import("./secrets");

migrate();
const app = buildApp();

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json" } as Record<string, string> });
const cookieOf = (res: Response): string => `glanceos_session=${/glanceos_session=([a-f0-9]+)/.exec(res.headers.get("set-cookie") ?? "")![1]}`;
const authed = (cookie: string, body?: unknown) => {
  const token = /glanceos_session=([a-f0-9]+)/.exec(cookie)![1];
  return {
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), cookie, "x-csrf-token": hmacSign(`csrf:${token}`) } as Record<string, string>,
  };
};

const register = async (name: string, email: string) => {
  const res = await app.request("/api/auth/register", { method: "POST", ...json({ name, email, password: "password123" }) });
  return cookieOf(res);
};

const aCookie = await register("Alice", "a@org.com");
const bCookie = await register("Bob", "b@org.com");

describe("org API: create, invite, accept, switch, guard", () => {
  let teamId = "";

  it("a fresh account has a personal org and starts in it", async () => {
    const status = await (await app.request("/api/auth/status", { headers: { cookie: aCookie } })).json();
    expect(status.activeOrg.personal).toBe(true);
    expect(status.role).toBe("owner");
    expect(status.orgs).toHaveLength(1);
  });

  it("creates a team org and switches into it", async () => {
    const res = await app.request("/api/orgs", { method: "POST", ...authed(aCookie, { name: "Acme Inc" }) });
    expect(res.status).toBe(201);
    teamId = (await res.json()).id;
    const status = await (await app.request("/api/auth/status", { headers: { cookie: aCookie } })).json();
    expect(status.activeOrg.id).toBe(teamId); // creating switched the active org
    expect(status.activeOrg.personal).toBe(false);
  });

  it("invites Bob, who accepts and lands in the team as editor", async () => {
    const inv = await app.request(`/api/orgs/${teamId}/invites`, { method: "POST", ...authed(aCookie, { email: "b@org.com", role: "editor" }) });
    expect(inv.status).toBe(201);
    const token = (await inv.json()).token as string;

    const preview = await (await app.request(`/api/invites/${token}`, { headers: { cookie: bCookie } })).json();
    expect(preview.org.id).toBe(teamId);

    const acc = await app.request(`/api/invites/${token}/accept`, { method: "POST", ...authed(bCookie) });
    expect(acc.status).toBe(200);
    const bStatus = await (await app.request("/api/auth/status", { headers: { cookie: bCookie } })).json();
    expect(bStatus.activeOrg.id).toBe(teamId);
    expect(bStatus.role).toBe("editor");
  });

  it("lists both members for the owner", async () => {
    const body = await (await app.request(`/api/orgs/${teamId}/members`, { headers: { cookie: aCookie } })).json();
    expect(body.members).toHaveLength(2);
  });

  it("denies an editor (Bob) the admin-only invite action", async () => {
    const res = await app.request(`/api/orgs/${teamId}/invites`, { method: "POST", ...authed(bCookie, { email: "c@org.com", role: "viewer" }) });
    expect(res.status).toBe(403);
  });

  it("won't switch a non-member into an org", async () => {
    const carol = await register("Carol", "c@org.com");
    const res = await app.request("/api/orgs/switch", { method: "POST", ...authed(carol, { orgId: teamId }) });
    expect(res.status).toBe(403);
  });
});
