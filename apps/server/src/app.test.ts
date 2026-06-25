import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The DB module reads this at import time — set it before anything loads.
process.env.GLANCEOS_DATA_DIR = mkdtempSync(join(tmpdir(), "glanceos-test-"));
process.env.GLANCEOS_RATE_LIMIT = "off"; // the integration flow makes bursts of auth/poll calls

const { migrate } = await import("./db");
const { seedTemplates } = await import("./seed");
const { buildApp } = await import("./api");
const { hmacSign } = await import("./secrets");

migrate();
seedTemplates();
const app = buildApp();

const json = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" } as Record<string, string>,
});

const authed = (cookie: string, body?: unknown) => {
  const token = /glanceos_session=([a-f0-9]+)/.exec(cookie)?.[1] ?? "";
  return {
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      cookie,
      "x-csrf-token": hmacSign(`csrf:${token}`), // double-submit token for mutating verbs
    } as Record<string, string>,
  };
};

function cookieOf(res: Response): string {
  const match = /glanceos_session=([a-f0-9]+)/.exec(res.headers.get("set-cookie") ?? "");
  expect(match).not.toBeNull();
  return `glanceos_session=${match![1]}`;
}

function cookieOfName(res: Response, name: string): string {
  const m = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]+)`).exec(res.headers.get("set-cookie") ?? "");
  expect(m).not.toBeNull();
  return `${name}=${m![1]}`;
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

  it("Remote: per-device command is owner-scoped + validated (offline → delivered 0)", async () => {
    const ok = await app.request(`/api/devices/${device.deviceId}/command`, { method: "POST", ...authed(cookieA, { command: "reload" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, delivered: 0 }); // claimed but not SSE-connected
    expect((await app.request(`/api/devices/${device.deviceId}/command`, { method: "POST", ...authed(cookieA, { command: "wipe" }) })).status).toBe(400);
    expect((await app.request(`/api/devices/nonexistent/command`, { method: "POST", ...authed(cookieA, { command: "reload" }) })).status).toBe(404);
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

    // Publishing now submits for review — it does NOT appear in the public hub yet.
    await app.request(`/api/layouts/${setupId}/publish`, {
      method: "POST",
      ...authed(cookieA, { description: "A calm desk board" }),
    });
    const pending = await (await app.request("/api/hub?q=desk", { headers: { cookie: cookieB } })).json();
    expect(pending.find((i: { name: string }) => i.name === "Desk")).toBeUndefined();

    // The admin (Asha — the first registered user) approves it.
    const queue = await (await app.request("/api/templates/pending", { headers: { cookie: cookieA } })).json();
    const submitted = queue.find((i: { name: string }) => i.name === "Desk");
    expect(submitted).toMatchObject({ author: "Asha", description: "A calm desk board" });
    expect((await app.request("/api/templates/pending", { headers: { cookie: cookieB } })).status).toBe(403); // non-admin
    await app.request(`/api/templates/${submitted.id}/review`, { method: "POST", ...authed(cookieA, { approved: true }) });

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
    expect((await app.request(`/api/layouts/${builtin.id}`, { method: "DELETE", ...authed(cookieA) })).status).toBe(404);
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

    expect((await app.request(`/api/layouts/${setupId}`, { method: "DELETE", ...authed(cookieA) })).status).toBe(200);
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

  it("a time-of-day schedule wins over the device's default board", async () => {
    const base = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Base Board", document: LOCAL_LAYOUT }) })).json();
    await app.request(`/api/devices/${device.deviceId}`, { method: "PATCH", ...authed(cookieA, { layoutId: base.id }) });
    const sched = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Scheduled", document: LOCAL_LAYOUT }) })).json();
    // an always-on window (every day, all minutes) → schedule layout should always be active
    const put = await app.request(`/api/devices/${device.deviceId}/schedules`, {
      method: "PUT",
      ...authed(cookieA, { timezone: "UTC", schedules: [{ layoutId: sched.id, enabled: true, priority: 1, daysMask: 127, startMin: 0, endMin: 1440 }] }),
    });
    expect(put.status).toBe(200);
    expect((await put.json()).schedules).toHaveLength(1);

    const me = await (await app.request("/api/devices/me", {
      headers: { "x-device-id": device.deviceId, "x-device-secret": device.deviceSecret },
    })).json();
    expect(me.state.layout.name).toBe("Scheduled"); // schedule beats the default board

    // clearing schedules falls back to the device's default board
    await app.request(`/api/devices/${device.deviceId}/schedules`, { method: "PUT", ...authed(cookieA, { schedules: [] }) });
    const after = await (await app.request("/api/devices/me", {
      headers: { "x-device-id": device.deviceId, "x-device-secret": device.deviceSecret },
    })).json();
    expect(after.state.layout.name).toBe("Base Board");
  });

  it("accepts an image upload and rejects bad type / oversized", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" }));
    const res = await app.request("/api/uploads", { method: "POST", body: fd, ...authed(cookieA) });
    expect(res.status).toBe(201);
    const { url } = await res.json();
    expect(url).toMatch(/^\/uploads\/[\w-]+\.png$/);

    const bad = new FormData();
    bad.append("file", new File(["plain"], "x.txt", { type: "text/plain" }));
    expect((await app.request("/api/uploads", { method: "POST", body: bad, ...authed(cookieA) })).status).toBe(400);

    const big = new FormData();
    big.append("file", new File([new Uint8Array(2 * 1024 * 1024 + 16)], "big.png", { type: "image/png" }));
    expect((await app.request("/api/uploads", { method: "POST", body: big, ...authed(cookieA) })).status).toBe(413);

    // unauthenticated upload is rejected by the session guard
    const noauth = new FormData();
    noauth.append("file", new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
    expect((await app.request("/api/uploads", { method: "POST", body: noauth })).status).toBe(401);
  });

  it("shares a board by public read-only link, gated and revocable", async () => {
    const layout = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Shared", document: LOCAL_LAYOUT }) })).json();

    // not shared yet
    expect(await (await app.request(`/api/layouts/${layout.id}/share`, { headers: { cookie: cookieA } })).json()).toMatchObject({ token: null });

    // user B cannot share user A's board
    expect((await app.request(`/api/layouts/${layout.id}/share`, { method: "POST", ...authed(cookieB, {}) })).status).toBe(404);

    // A creates a public link
    const share = await (await app.request(`/api/layouts/${layout.id}/share`, { method: "POST", ...authed(cookieA, {}) })).json();
    expect(share.token).toBeTruthy();
    expect(share.url).toContain(`/s/${share.token}`); // v6.1: unfurl-friendly /s/:token landing

    // the /s/:token landing serves per-token OpenGraph meta + redirects to the viewer
    const land = await app.request(`/s/${share.token}`);
    expect(land.status).toBe(200);
    const landHtml = await land.text();
    expect(landHtml).toContain('property="og:image"');
    expect(landHtml).toContain(`/api/public/board/${share.token}/preview.png`);
    expect(landHtml).toContain(`/screen/?share=${share.token}`);
    expect((await app.request("/s/nonexistent-token")).status).toBe(404);

    // the public endpoint serves the board with NO auth, resolving live data under the owner
    const pub = await app.request(`/api/public/board/${share.token}`);
    expect(pub.status).toBe(200);
    const payload = await pub.json();
    expect(payload.state.layout.name).toBe("Shared");
    expect(payload.state.data.wt.items.length).toBeGreaterThan(0);

    // revoking turns the link off (404), and a bogus token never resolves
    expect((await app.request(`/api/layouts/${layout.id}/share`, { method: "DELETE", ...authed(cookieA) })).status).toBe(200);
    expect((await app.request(`/api/public/board/${share.token}`)).status).toBe(404);
    expect((await app.request("/api/public/board/nope")).status).toBe(404);
  });

  it("password-protects a share link", async () => {
    const layout = await (await app.request("/api/layouts", { method: "POST", ...authed(cookieA, { name: "Locked", document: LOCAL_LAYOUT }) })).json();
    const share = await (await app.request(`/api/layouts/${layout.id}/share`, { method: "POST", ...authed(cookieA, { password: "s3cret" }) })).json();
    expect(share.hasPassword).toBe(true);
    expect((await app.request(`/api/public/board/${share.token}`)).status).toBe(401); // locked, no cookie
    // password goes in the POST body, never the URL
    expect((await app.request(`/api/public/board/${share.token}/unlock`, { method: "POST", ...json({ password: "wrong" }) })).status).toBe(401);
    const unlocked = await app.request(`/api/public/board/${share.token}/unlock`, { method: "POST", ...json({ password: "s3cret" }) });
    expect(unlocked.status).toBe(200);
    const cookie = cookieOfName(unlocked, `glanceos_share_${share.token.slice(0, 12)}`);
    const ok = await app.request(`/api/public/board/${share.token}`, { headers: { cookie } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).state.layout.name).toBe("Locked");
    expect((await app.request(`/api/public/board/${share.token}`, { headers: { cookie: `glanceos_share_${share.token.slice(0, 12)}=forged` } })).status).toBe(401); // forged cookie rejected
  });

  it("rejects a config-plane mutation without a CSRF token (403)", async () => {
    const noCsrf = await app.request("/api/layouts", { method: "POST", body: JSON.stringify({ name: "X" }), headers: { "content-type": "application/json", cookie: cookieA } });
    expect(noCsrf.status).toBe(403);
  });

  it("manages the account (rename, password, delete) and logs out everywhere", async () => {
    const reg = await app.request("/api/auth/register", { method: "POST", ...json({ name: "Temp", email: "temp@example.com", password: "temp-pass-1" }) });
    const cookieT = cookieOf(reg);

    expect((await app.request("/api/account", { method: "PATCH", ...authed(cookieT, { name: "Renamed" }) })).status).toBe(200);
    expect((await (await app.request("/api/auth/status", { headers: { cookie: cookieT } })).json()).user.name).toBe("Renamed");

    expect((await app.request("/api/account/password", { method: "POST", ...authed(cookieT, { current: "wrong", next: "temp-pass-2" }) })).status).toBe(400);
    expect((await app.request("/api/account/password", { method: "POST", ...authed(cookieT, { current: "temp-pass-1", next: "temp-pass-2" }) })).status).toBe(200);

    // export returns the user's data
    const exp = await (await app.request("/api/account/export", { headers: { cookie: cookieT } })).json();
    expect(exp.format).toBe("glanceos-backup");

    // delete: wrong password 401, correct 200, then the session is gone
    expect((await app.request("/api/account", { method: "DELETE", ...authed(cookieT, { password: "nope" }) })).status).toBe(401);
    expect((await app.request("/api/account", { method: "DELETE", ...authed(cookieT, { password: "temp-pass-2" }) })).status).toBe(200);
    expect((await app.request("/api/devices", { headers: { cookie: cookieT } })).status).toBe(401);

    // log-out-everywhere invalidates a separate user's session
    const reg2 = await app.request("/api/auth/register", { method: "POST", ...json({ name: "Sess", email: "sess@example.com", password: "sess-pass-1" }) });
    const cookieS = cookieOf(reg2);
    expect((await app.request("/api/account/logout-everywhere", { method: "POST", ...authed(cookieS) })).status).toBe(200);
    expect((await app.request("/api/devices", { headers: { cookie: cookieS } })).status).toBe(401);
  });

  it("logs out and re-locks the config plane", async () => {
    await app.request("/api/auth/logout", { method: "POST", headers: { cookie: cookieA } });
    expect((await app.request("/api/devices", { headers: { cookie: cookieA } })).status).toBe(401);
  });
});

describe("backup export → import", () => {
  const reg = async (name: string, email: string) =>
    cookieOf(await app.request("/api/auth/register", { method: "POST", ...json({ name, email, password: "calm-glass-imp" }) }));

  it("round-trips a user's data into another account (append), without secrets", async () => {
    const cookieX = await reg("Xan", "x@example.com");
    await app.request("/api/layouts", { method: "POST", ...authed(cookieX, { name: "Board X", document: LOCAL_LAYOUT }) });
    await app.request("/api/connections", { method: "POST", ...authed(cookieX, { provider: "todoist", label: "My Todoist", secret: "sekret-token-123" }) });
    await app.request("/api/tasks", { method: "POST", ...authed(cookieX, { text: "X task" }) });

    const dump = await (await app.request("/api/account/export", { headers: { cookie: cookieX } })).json();
    expect(JSON.stringify(dump)).not.toContain("sekret-token"); // secrets never exported

    const cookieY = await reg("Yad", "y@example.com");
    const r = await (await app.request("/api/account/import", { method: "POST", ...authed(cookieY, { dump, mode: "append" }) })).json();
    expect(r).toMatchObject({ ok: true, layouts: 1, connections: 1, tasks: 1 });

    const yLayouts = await (await app.request("/api/layouts", { headers: { cookie: cookieY } })).json() as { name: string }[];
    expect(yLayouts.some((l) => l.name === "Board X")).toBe(true);
    const yConns = await (await app.request("/api/connections", { headers: { cookie: cookieY } })).json() as { id: string; label: string; status: string }[];
    const yConn = yConns.find((cc) => cc.label === "My Todoist")!;
    expect(yConn.status).toBe("needs_auth"); // no secret imported
    expect("secret" in yConn).toBe(false);
  });

  it("rejects a non-backup file and skips a malformed board", async () => {
    const cookie = await reg("Zoe", "z@example.com");
    expect((await app.request("/api/account/import", { method: "POST", ...authed(cookie, { dump: { format: "nope" }, mode: "append" }) })).status).toBe(400);
    const dump = { format: "glanceos-backup", version: 1, layouts: [{ id: 1, name: "Bad", document: "{not json" }, { id: 2, name: "Good", document: JSON.stringify(LOCAL_LAYOUT) }] };
    const r = await (await app.request("/api/account/import", { method: "POST", ...authed(cookie, { dump, mode: "append" }) })).json();
    expect(r.layouts).toBe(1); // only the good board
    expect(r.skipped).toBeGreaterThanOrEqual(1); // the malformed one
  });

  it("replace wipes the user's own boards first", async () => {
    const cookie = await reg("Rae", "r@example.com");
    await app.request("/api/layouts", { method: "POST", ...authed(cookie, { name: "Pre A", document: LOCAL_LAYOUT }) });
    await app.request("/api/layouts", { method: "POST", ...authed(cookie, { name: "Pre B", document: LOCAL_LAYOUT }) });
    const dump = { format: "glanceos-backup", version: 1, layouts: [{ id: 9, name: "Only", document: JSON.stringify(LOCAL_LAYOUT) }] };
    await app.request("/api/account/import", { method: "POST", ...authed(cookie, { dump, mode: "replace" }) });
    const layouts = await (await app.request("/api/layouts", { headers: { cookie } })).json() as { name: string }[];
    expect(layouts.map((l) => l.name).sort()).toEqual(["Only"]); // Pre A/B wiped
  });
});

describe("display groups (signage)", () => {
  const reg = async (name: string, email: string) =>
    cookieOf(await app.request("/api/auth/register", { method: "POST", ...json({ name, email, password: "calm-glass-grp" }) }));

  it("a grouped device with no own board falls back to the group default, but its own board wins", async () => {
    const cookie = await reg("Gina", "gina@example.com");
    const group = await (await app.request("/api/groups", { method: "POST", ...authed(cookie, { name: "Lobby" }) })).json();
    const board = await (await app.request("/api/layouts", { method: "POST", ...authed(cookie, { name: "Lobby board", document: LOCAL_LAYOUT }) })).json();
    await app.request(`/api/groups/${group.id}`, { method: "PATCH", ...authed(cookie, { layoutId: board.id }) });

    const dev = await (await app.request("/api/devices/register", { method: "POST", ...json({ profile: { width: 1920, height: 1080 } }) })).json();
    await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: dev.claimCode, name: "Lobby screen" }) });
    await app.request(`/api/devices/${dev.deviceId}`, { method: "PATCH", ...authed(cookie, { groupId: group.id }) });

    const creds = { "x-device-id": dev.deviceId, "x-device-secret": dev.deviceSecret };
    const me = await (await app.request("/api/devices/me", { headers: creds })).json();
    expect(me.state.layout.name).toBe("Lobby board"); // group default

    const own = await (await app.request("/api/layouts", { method: "POST", ...authed(cookie, { name: "Own board", document: LOCAL_LAYOUT }) })).json();
    await app.request(`/api/devices/${dev.deviceId}`, { method: "PATCH", ...authed(cookie, { layoutId: own.id }) });
    const me2 = await (await app.request("/api/devices/me", { headers: creds })).json();
    expect(me2.state.layout.name).toBe("Own board"); // device's own board wins

    const groups = await (await app.request("/api/groups", { headers: { cookie } })).json() as { id: number; deviceCount: number }[];
    expect(groups.find((g) => g.id === group.id)!.deviceCount).toBe(1);
  });

  it("groups are per-user (no cross-user read/patch)", async () => {
    const a = await reg("Ari", "ari@example.com");
    const b = await reg("Ben", "ben@example.com");
    const g = await (await app.request("/api/groups", { method: "POST", ...authed(a, { name: "A-only" }) })).json();
    expect(await (await app.request("/api/groups", { headers: { cookie: b } })).json()).toEqual([]);
    expect((await app.request(`/api/groups/${g.id}`, { method: "PATCH", ...authed(b, { name: "hijack" }) })).status).toBe(404);
  });
});

describe("signage: fleet commands + proof-of-play", () => {
  const reg = async (name: string, email: string) =>
    cookieOf(await app.request("/api/auth/register", { method: "POST", ...json({ name, email, password: "calm-glass-grp" }) }));

  it("records play-log and reports it for the group (JSON + CSV)", async () => {
    const cookie = await reg("Pia", "pia@example.com");
    const group = await (await app.request("/api/groups", { method: "POST", ...authed(cookie, { name: "Hall" }) })).json();
    const dev = await (await app.request("/api/devices/register", { method: "POST", ...json({ profile: { width: 1920, height: 1080 } }) })).json();
    await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: dev.claimCode, name: "Hall screen" }) });
    await app.request(`/api/devices/${dev.deviceId}`, { method: "PATCH", ...authed(cookie, { groupId: group.id }) });

    const creds = { "x-device-id": dev.deviceId, "x-device-secret": dev.deviceSecret, "content-type": "application/json" };
    const res = await app.request("/api/devices/me/play-log", { method: "POST", headers: creds, body: JSON.stringify({ entries: [{ layoutId: 1, shownAt: 1_780_000_000_000, durationMs: 5000 }, { layoutId: 2, shownAt: 1_780_000_100_000 }] }) });
    expect((await res.json()).written).toBe(2);

    const report = await (await app.request(`/api/groups/${group.id}/play-log?days=365`, { headers: { cookie } })).json();
    expect(report.rows.length).toBe(2);
    const csv = await (await app.request(`/api/groups/${group.id}/play-log?days=365&format=csv`, { headers: { cookie } })).text();
    expect(csv.split("\n")[0]).toContain("shown_at_iso");
    expect(csv.split("\n").length).toBe(3); // header + 2 rows
  });

  it("rejects unknown fleet commands, accepts known ones", async () => {
    const cookie = await reg("Cleo", "cleo@example.com");
    const group = await (await app.request("/api/groups", { method: "POST", ...authed(cookie, { name: "Cmd" }) })).json();
    expect((await app.request(`/api/groups/${group.id}/command`, { method: "POST", ...authed(cookie, { command: "explode" }) })).status).toBe(400);
    const ok = await app.request(`/api/groups/${group.id}/command`, { method: "POST", ...authed(cookie, { command: "reload" }) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).delivered).toBe(0); // no live SSE connection in the test
  });
});

describe("native platform identity", () => {
  it("a device self-reports its platform; it surfaces on the summary, sanitized", async () => {
    const cookie = cookieOf(await app.request("/api/auth/register", { method: "POST", ...json({ name: "Pat", email: "pat-native@example.com", password: "calm-glass-grp" }) }));
    const dev = await (await app.request("/api/devices/register", { method: "POST", ...json({ profile: { width: 1920, height: 1080, platform: "fire tv!!", nativeVersion: "1.0.0" } }) })).json();
    await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: dev.claimCode, name: "Lobby FireTV" }) });
    const list = await (await app.request("/api/devices", { headers: { cookie } })).json() as { id: string; platform: string | null; nativeVersion: string | null }[];
    const d = list.find((x) => x.id === dev.deviceId)!;
    expect(d.platform).toBe("firetv"); // space + "!" stripped by the sanitizer
    expect(d.nativeVersion).toBe("1.0.0"); // dots preserved
  });

  it("a device with no platform reports null (ungrouped, unchanged)", async () => {
    const cookie = cookieOf(await app.request("/api/auth/register", { method: "POST", ...json({ name: "Nil", email: "nil-native@example.com", password: "calm-glass-grp" }) }));
    const dev = await (await app.request("/api/devices/register", { method: "POST", ...json({ profile: { width: 800, height: 480 } }) })).json();
    await app.request("/api/devices/claim", { method: "POST", ...authed(cookie, { code: dev.claimCode, name: "Plain panel" }) });
    const list = await (await app.request("/api/devices", { headers: { cookie } })).json() as { id: string; platform: string | null }[];
    expect(list.find((x) => x.id === dev.deviceId)!.platform).toBeNull();
  });
});
