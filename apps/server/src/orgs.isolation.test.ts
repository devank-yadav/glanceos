import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Phase-1 GATE: a second tenant must NEVER see or touch another org's boards/screens.
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-isolation-"));
process.env.GLANCEOS_RATE_LIMIT = "off";

const { migrate } = await import("./db");
const { buildApp } = await import("./api");
const { hmacSign } = await import("./secrets");

migrate();
const app = buildApp();

const cookieOf = (res: Response): string => `glanceos_session=${/glanceos_session=([a-f0-9]+)/.exec(res.headers.get("set-cookie") ?? "")![1]}`;
const authed = (cookie: string, body?: unknown) => {
  const token = /glanceos_session=([a-f0-9]+)/.exec(cookie)![1];
  return {
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), cookie, "x-csrf-token": hmacSign(`csrf:${token}`) } as Record<string, string>,
  };
};
const reg = async (name: string, email: string) =>
  cookieOf(await app.request("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password: "password123" }), headers: { "content-type": "application/json" } }));
const json = <T = any>(r: Response): Promise<T> => r.json();

const alice = await reg("Alice", "a@iso.com");
const bob = await reg("Bob", "b@iso.com");

// Alice creates a board + claims a screen in her personal org.
const aBoard = (await json(await app.request("/api/layouts", { method: "POST", ...authed(alice, { name: "Alice secret board" }) }))).id as number;
const aReg = await json(await app.request("/api/devices/register", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
const aDevice = (await json(await app.request("/api/devices/claim", { method: "POST", ...authed(alice, { code: aReg.claimCode, name: "Alice TV" }) }))).id as string;

describe("cross-tenant isolation (personal orgs)", () => {
  it("Bob's board list excludes Alice's board", async () => {
    const list = await json<any[]>(await app.request("/api/layouts", { headers: { cookie: bob } }));
    expect(list.some((l) => l.id === aBoard)).toBe(false);
  });
  it("Bob gets 404 reading, updating, or deleting Alice's board", async () => {
    expect((await app.request(`/api/layouts/${aBoard}`, { headers: { cookie: bob } })).status).toBe(404);
    expect((await app.request(`/api/layouts/${aBoard}`, { method: "PUT", ...authed(bob, { document: { schemaVersion: 3, name: "hijack", gap: 2, rows: [] } }) })).status).toBe(404);
    expect((await app.request(`/api/layouts/${aBoard}`, { method: "DELETE", ...authed(bob) })).status).toBe(404);
  });
  it("Bob's screen list excludes Alice's screen, and he can't patch or delete it", async () => {
    const devs = await json<any[]>(await app.request("/api/devices", { headers: { cookie: bob } }));
    expect(devs.some((d) => d.id === aDevice)).toBe(false);
    expect((await app.request(`/api/devices/${aDevice}`, { method: "PATCH", ...authed(bob, { name: "hijack" }) })).status).toBe(404);
    expect((await app.request(`/api/devices/${aDevice}`, { method: "DELETE", ...authed(bob) })).status).toBe(404);
  });
  it("Alice still has full access to her own board + screen", async () => {
    expect((await app.request(`/api/layouts/${aBoard}`, { headers: { cookie: alice } })).status).toBe(200);
    expect((await json<any[]>(await app.request("/api/devices", { headers: { cookie: alice } }))).some((d) => d.id === aDevice)).toBe(true);
  });
});

describe("team membership grants org boards, not the inviter's personal boards", () => {
  it("an invited editor sees the TEAM board but never the inviter's personal board", async () => {
    // Alice spins up a team, makes a team board, invites Bob.
    const teamId = (await json(await app.request("/api/orgs", { method: "POST", ...authed(alice, { name: "Acme" }) }))).id as string;
    const teamBoard = (await json(await app.request("/api/layouts", { method: "POST", ...authed(alice, { name: "Team board" }) }))).id as number;
    const token = (await json(await app.request(`/api/orgs/${teamId}/invites`, { method: "POST", ...authed(alice, { email: "b@iso.com", role: "editor" }) }))).token as string;
    await app.request(`/api/invites/${token}/accept`, { method: "POST", ...authed(bob) });

    const list = await json<any[]>(await app.request("/api/layouts", { headers: { cookie: bob } }));
    expect(list.some((l) => l.id === teamBoard)).toBe(true); // sees the team board
    expect(list.some((l) => l.id === aBoard)).toBe(false); // never Alice's personal board
  });
});
