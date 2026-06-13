import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The DB module reads this at import time — set it before anything loads.
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-test-"));

const { migrate } = await import("./db");
const { seedTemplates } = await import("./seed");
const { buildApp } = await import("./api");

migrate();
seedTemplates();
const app = buildApp();

const json = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" } as Record<string, string>,
});

const authed = (cookie: string, body?: unknown) => ({
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  headers: {
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    cookie,
  } as Record<string, string>,
});

function cookieOf(res: Response): string {
  const match = /glanceos_session=([a-f0-9]+)/.exec(res.headers.get("set-cookie") ?? "");
  expect(match).not.toBeNull();
  return `glanceos_session=${match![1]}`;
}

// No network: only local-data widgets, so /me and preview-state compose offline.
const LOCAL_LAYOUT = {
  schemaVersion: 3,
  name: "Desk",
  gap: 1,
  rows: [
    {
      id: "r1",
      h: 6,
      blocks: [
        { id: "wc", type: "clock", props: {} },
        { id: "wt", type: "tasks", props: { listId: "default", maxItems: 5 } },
      ],
    },
    {
      id: "r2",
      h: 8,
      blocks: [
        { id: "wq", type: "queue", props: { queueId: "default", title: "Serving" } },
        { id: "wh", type: "heading", props: { content: "Hi" } },
      ],
    },
  ],
};

let cookieA = "";
let cookieB = "";
let device = { deviceId: "", deviceSecret: "", claimCode: "" };
let setupId = 0;

describe("multi-user auth, pairing, setups, hub", () => {
  it("starts unauthenticated with open registration", async () => {
    const status = await (await app.request("/api/auth/status")).json();
    expect(status).toMatchObject({ authed: false, user: null, registrationOpen: true });
    expect((await app.request("/api/devices")).status).toBe(401);
  });

  it("registers user A, rejects short passwords and duplicate emails", async () => {
    expect(
      (await app.request("/api/auth/register", { method: "POST", ...json({ name: "Asha", email: "a@example.com", password: "short" }) })).status,
    ).toBe(400);
    const res = await app.request("/api/auth/register", {
      method: "POST",
      ...json({ name: "Asha", email: "a@example.com", password: "calm-glass-1" }),
    });
    expect(res.status).toBe(201);
    cookieA = cookieOf(res);
    expect(
      (await app.request("/api/auth/register", { method: "POST", ...json({ name: "Imposter", email: "A@EXAMPLE.COM", password: "calm-glass-2" }) })).status,
    ).toBe(409);
    const status = await (await app.request("/api/auth/status", { headers: { cookie: cookieA } })).json();
    expect(status.authed).toBe(true);
    expect(status.user.email).toBe("a@example.com");
  });

  it("honors the registration valve but not for the first user", async () => {
    process.env.GLANCEOS_REGISTRATION = "closed";
    expect(
      (await app.request("/api/auth/register", { method: "POST", ...json({ name: "C", email: "c@example.com", password: "calm-glass-3" }) })).status,
    ).toBe(403);
    delete process.env.GLANCEOS_REGISTRATION;
  });

  it("claims a device for A with NO auto-assigned setup", async () => {
    const reg = await app.request("/api/devices/register", { method: "POST", ...json({ profile: { width: 800, height: 480 } }) });
    expect(reg.status).toBe(201);
    device = await reg.json();
    expect((await app.request("/api/devices/claim", { method: "POST", ...json({ code: device.claimCode }) })).status).toBe(401);
    const res = await app.request("/api/devices/claim", {
      method: "POST",
      ...authed(cookieA, { code: device.claimCode.toLowerCase(), name: "Desk screen" }),
    });
    expect(res.status).toBe(200);
    const claimed = await res.json();
    expect(claimed).toMatchObject({ claimed: true, layoutId: null, layoutName: null });
  });

  it("creates a setup, assigns it, and composes scoped device state", async () => {
    const created = await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Desk" }) });
    expect(created.status).toBe(201);
    setupId = (await created.json()).id;

    const put = await app.request(`/api/layouts/${setupId}`, { method: "PUT", ...authed(cookieA, { document: LOCAL_LAYOUT }) });
    expect((await put.json()).version).toBe(2);

    const patched = await app.request(`/api/devices/${device.deviceId}`, { method: "PATCH", ...authed(cookieA, { layoutId: setupId }) });
    expect((await patched.json()).layoutName).toBe("Desk");

    await app.request("/api/tasks", { method: "POST", ...authed(cookieA, { text: "A's task" }) });
    const me = await app.request("/api/devices/me", {
      headers: { "x-device-id": device.deviceId, "x-device-secret": device.deviceSecret },
    });
    const payload = await me.json();
    expect(payload.state.layout.name).toBe("Desk");
    expect(payload.state.data.wt.items.map((t: { text: string }) => t.text)).toContain("A's task");
    expect(payload.state.data.wq).toMatchObject({ title: "Serving", nowServing: 0 });
  });

  it("isolates user B from user A completely", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      ...json({ name: "Bela", email: "b@example.com", password: "calm-glass-9" }),
    });
    cookieB = cookieOf(res);

    expect(await (await app.request("/api/devices", { headers: { cookie: cookieB } })).json()).toEqual([]);
    expect((await app.request(`/api/layouts/${setupId}`, { headers: { cookie: cookieB } })).status).toBe(404);
    expect((await app.request(`/api/layouts/${setupId}`, { method: "PUT", ...authed(cookieB, { document: LOCAL_LAYOUT }) })).status).toBe(404);
    expect(await (await app.request("/api/tasks", { headers: { cookie: cookieB } })).json()).toEqual([]);

    const bAdvance = await (await app.request("/api/queues/default/advance", { method: "POST", ...authed(cookieB, {}) })).json();
    expect(bAdvance.now_serving).toBe(1);
    const aQueue = await (await app.request("/api/queues/default", { headers: { cookie: cookieA } })).json();
    expect(aQueue.now_serving).toBe(0);
  });

  it("publishes to the hub, browses with search, imports a copy", async () => {
    const before = await (await app.request("/api/hub", { headers: { cookie: cookieB } })).json();
    expect(before.length).toBeGreaterThanOrEqual(4); // builtins
    expect(before.every((i: { author: string }) => i.author === "GlanceOS")).toBe(true);

    await app.request(`/api/layouts/${setupId}`, {
      method: "PATCH",
      ...authed(cookieA, { published: true, description: "A calm desk board" }),
    });

    const found = await (await app.request("/api/hub?q=desk", { headers: { cookie: cookieB } })).json();
    const mine = found.find((i: { name: string }) => i.name === "Desk");
    expect(mine).toMatchObject({ author: "Asha", description: "A calm desk board" });

    const imported = await app.request(`/api/hub/${mine.id}/import`, { method: "POST", ...authed(cookieB, {}) });
    expect(imported.status).toBe(201);
    const bSetups = await (await app.request("/api/layouts", { headers: { cookie: cookieB } })).json();
    expect(bSetups).toHaveLength(1);
    expect(bSetups[0].name).toBe("Desk");

    const after = await (await app.request("/api/hub?q=desk", { headers: { cookie: cookieA } })).json();
    expect(after.find((i: { id: number }) => i.id === mine.id).importCount).toBe(1);
  });

  it("never lets anyone edit or delete builtins", async () => {
    const hub = await (await app.request("/api/hub", { headers: { cookie: cookieA } })).json();
    const builtin = hub.find((i: { author: string }) => i.author === "GlanceOS");
    expect((await app.request(`/api/layouts/${builtin.id}`, { method: "PUT", ...authed(cookieA, { document: LOCAL_LAYOUT }) })).status).toBe(404);
    expect((await app.request(`/api/layouts/${builtin.id}`, { method: "PATCH", ...authed(cookieA, { published: false }) })).status).toBe(404);
    expect((await app.request(`/api/layouts/${builtin.id}`, { method: "DELETE", headers: { cookie: cookieA } })).status).toBe(404);
  });

  it("composes preview-state without bumping versions", async () => {
    const res = await app.request("/api/layouts/preview-state", { method: "POST", ...authed(cookieA, { document: LOCAL_LAYOUT }) });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.wt.items.length).toBeGreaterThan(0);
    expect(data.wc).toBeUndefined(); // clock renders locally

    const bad = await app.request("/api/layouts/preview-state", {
      method: "POST",
      ...authed(cookieA, { document: { schemaVersion: 1 } }),
    });
    expect(bad.status).toBe(400);

    const layout = await (await app.request(`/api/layouts/${setupId}`, { headers: { cookie: cookieA } })).json();
    expect(layout.version).toBe(2); // preview never bumps
  });

  it("duplicates and deletes setups; deleting unassigns the screen", async () => {
    const dup = await app.request(`/api/layouts/${setupId}/duplicate`, { method: "POST", ...authed(cookieA, {}) });
    expect(dup.status).toBe(201);
    expect((await dup.json()).name).toBe("Desk copy");

    expect((await app.request(`/api/layouts/${setupId}`, { method: "DELETE", headers: { cookie: cookieA } })).status).toBe(200);
    const devices = await (await app.request("/api/devices", { headers: { cookie: cookieA } })).json();
    expect(devices[0]).toMatchObject({ layoutId: null, layoutName: null });
  });

  it("serves the e-ink device protocol with telemetry + refresh", async () => {
    // give the device a setup again and a custom refresh interval
    const s = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Eink", document: LOCAL_LAYOUT }) })).json();
    await app.request(`/api/devices/${device.deviceId}`, { method: "PATCH", ...authed(cookieA, { layoutId: s.id }) });
    const patched = await (await app.request(`/api/devices/${device.deviceId}`, { method: "PATCH", ...authed(cookieA, { refreshSeconds: 600 }) })).json();
    expect(patched.refreshSeconds).toBe(600);

    const display = await app.request(`/api/devices/me/display?id=${device.deviceId}&secret=${device.deviceSecret}`, {
      headers: { "battery-percent": "73", rssi: "-60", "fw-version": "1.2.0" },
    });
    expect(display.status).toBe(200);
    const d = await display.json();
    expect(d).toMatchObject({ claimed: true, refresh_rate: 600 });
    expect(d.image_url).toContain("/api/devices/me/render.bmp");

    const summary = (await (await app.request("/api/devices", { headers: { cookie: cookieA } })).json())[0];
    expect(summary).toMatchObject({ battery: 73, rssi: -60, firmware: "1.2.0" });
    expect(summary.lastSeen).toBeGreaterThan(0);
  });

  it("rotates a screen through a playlist", async () => {
    const a = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Rot A", document: LOCAL_LAYOUT }) })).json();
    const b = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Rot B", document: LOCAL_LAYOUT }) })).json();
    const pl = await (await app.request("/api/playlists", { method: "POST", ...authed(cookieA, { name: "Loop", intervalSeconds: 5 }) })).json();
    await app.request(`/api/playlists/${pl.id}`, { method: "PATCH", ...authed(cookieA, { layoutIds: [a.id, b.id] }) });

    const assigned = await (await app.request(`/api/devices/${device.deviceId}`, { method: "PATCH", ...authed(cookieA, { playlistId: pl.id }) })).json();
    expect(assigned.playlistId).toBe(pl.id);
    expect(assigned.layoutId).toBeNull(); // a playlist replaces the single setup

    // the device's composed state shows one of the two rotating setups
    const me = await (await app.request("/api/devices/me", {
      headers: { "x-device-id": device.deviceId, "x-device-secret": device.deviceSecret },
    })).json();
    expect(["Rot A", "Rot B"]).toContain(me.state.layout.name);

    const playlists = await (await app.request("/api/playlists", { headers: { cookie: cookieA } })).json();
    expect(playlists.find((p: { id: number }) => p.id === pl.id).items).toHaveLength(2);
  });

  it("logs out and re-locks the config plane", async () => {
    await app.request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } });
    expect((await app.request("/api/devices", { headers: { cookie: cookieA } })).status).toBe(401);
  });
});
