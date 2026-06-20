import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BlockSource, ClaimRequest, RegisterRequest, UserLoginRequest, UserRegisterRequest, safeParseDocument,
} from "@glanceos/schema";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import {
  createSession, createUser, destroySession, getUser, registrationOpen, sessionUserId, verifyLogin,
} from "./auth";
import {
  authDevice, claimDevice, deleteDevice, deviceProfile, getDevice, listDevices, recordTelemetry,
  registerDevice, setDevicePlaylist, setDeviceTimezone, setRefresh, updateDevice, type DeviceRow,
} from "./devices";
import { listSchedules, setSchedules, type Schedule } from "./schedules";
import { listNotifications, markAllRead, markRead, unreadCount } from "./notifications";
import { isConnected, subscribe } from "./hub";
import {
  blankDocument, clearShareToken, createLayout, deleteLayout, duplicateLayout, getLayout,
  getLayoutByShareToken, getOwnedLayout, getShareToken, importFromHub, listPublished, listSetups,
  setShareToken, updateLayout, updateLayoutMeta,
} from "./layouts";
import {
  createPlaylist, deletePlaylist, getOwnedPlaylist, listPlaylists, updatePlaylist,
} from "./playlists";
import { advanceQueue, adjustWaiting, getQueue, resetQueue } from "./queues";
import { renderAvailable, renderImage, type RenderFormat } from "./render";
import {
  composeState, currentLayoutId, pushDevice, pushDeviceIds, pushDevicesUsingLayout,
  pushRotatingDevices, pushUserDevices,
} from "./state";
import { addTask, deleteTask, listTasks, updateTask } from "./tasks";
import {
  connLookupFor, createConnection, deleteConnection, getConnectionSummary, listConnections, updateConnection,
} from "./connections";
import { buildAuthorizeUrl, completeOAuth, NoOAuthApp } from "./oauth";
import { deleteOAuthApp, getOAuthAppSummary, setOAuthApp } from "./oauth-apps";
import { PROVIDERS } from "./providers/registry";
import { resolveSource } from "./providers/resolve";
import { resolveWidgetData } from "./widgets";

const here = dirname(fileURLToPath(import.meta.url));

const baseUrl = (): string => `http://127.0.0.1:${process.env.PORT ?? 8080}`;

// Public origin for OAuth redirect URIs — behind a reverse proxy the request
// origin is wrong, so GLANCEOS_PUBLIC_URL overrides it. Must match the redirect
// URI registered in the provider's OAuth app.
const publicBase = (c: Context): string =>
  process.env.GLANCEOS_PUBLIC_URL?.replace(/\/+$/, "") ?? new URL(c.req.url).origin;

const SESSION_COOKIE = "glanceos_session";

// The device plane authenticates with deviceId+secret and must work unclaimed;
// everything else is the config plane and needs a user session.
const DEVICE_PLANE = new Set([
  "/api/devices/register",
  "/api/devices/me",
  "/api/devices/me/stream",
  "/api/devices/me/display",
  "/api/devices/me/render.bmp",
  "/api/devices/me/telemetry",
]);

type Env = { Variables: { userId: string } };

// Secrets stay server-side; this is what the config app sees.
function deviceSummary(d: DeviceRow) {
  const layout = d.layout_id ? getLayout(d.layout_id) : undefined;
  const profile = deviceProfile(d);
  return {
    id: d.id,
    name: d.name,
    claimed: d.claimed_at !== null,
    layoutId: d.layout_id,
    layoutName: layout?.name ?? null,
    playlistId: d.playlist_id,
    online: isConnected(d.id),
    refreshSeconds: d.refresh_seconds,
    battery: d.battery,
    rssi: d.rssi,
    firmware: d.firmware,
    lastSeen: d.last_seen,
    resolution: `${profile.width}×${profile.height}`,
    timezone: d.timezone,
    renderOpts: safeJsonObj(d.render_opts),
    createdAt: d.created_at,
  };
}

const safeJsonObj = (s: string): Record<string, unknown> => {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
};

function telemetryFromHeaders(c: Context): { battery?: number; rssi?: number; firmware?: string } {
  const num = (v: string | undefined) => (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : undefined);
  return {
    battery: num(c.req.header("battery-percent")),
    rssi: num(c.req.header("rssi")),
    firmware: c.req.header("fw-version") || undefined,
  };
}

function setupSummary(l: ReturnType<typeof listSetups>[number]) {
  const { document, ...rest } = l;
  return {
    ...rest,
    widgetCount: document.rows.reduce((n, row) => n + row.blocks.length, 0),
    rowCount: document.rows.length,
  };
}

export function buildApp(): Hono<Env> {
  const app = new Hono<Env>();

  // ---- speed: gzip everything that isn't the API (never the SSE stream),
  // and let browsers cache hashed assets forever ----

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api")) return next();
    return compress()(c, next);
  });

  app.use("*", async (c, next) => {
    await next();
    const path = c.req.path;
    if (path.startsWith("/api")) return;
    if (/\/assets\//.test(path)) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      c.header("Cache-Control", "no-cache");
    }
  });

  // ---- session guard for the config plane ----

  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/auth/") || path.startsWith("/api/public/") || DEVICE_PLANE.has(path)) return next();
    const userId = sessionUserId(getCookie(c, SESSION_COOKIE));
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", userId);
    return next();
  });

  const issueSession = (c: Context, userId: string) => {
    const session = createSession(userId);
    setCookie(c, SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
    });
  };

  // ---- auth ----

  app.get("/api/auth/status", (c) => {
    const userId = sessionUserId(getCookie(c, SESSION_COOKIE));
    const user = userId ? getUser(userId) : null;
    return c.json({ authed: !!user, user, registrationOpen: registrationOpen() });
  });

  app.post("/api/auth/register", async (c) => {
    if (!registrationOpen()) return c.json({ error: "registration is closed on this server" }, 403);
    const body = UserRegisterRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "validation", issues: body.error.issues }, 400);
    const user = createUser(body.data.name, body.data.email, body.data.password);
    if (!user) return c.json({ error: "that email is already registered" }, 409);
    issueSession(c, user.id);
    return c.json({ ok: true, user }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const body = UserLoginRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "email and password required" }, 400);
    const user = verifyLogin(body.data.email, body.data.password);
    if (!user) return c.json({ error: "wrong email or password" }, 401);
    issueSession(c, user.id);
    return c.json({ ok: true, user });
  });

  app.post("/api/auth/logout", (c) => {
    destroySession(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // ---- device plane (open; device-credential auth) ----

  app.post("/api/devices/register", async (c) => {
    const body = RegisterRequest.safeParse(await c.req.json().catch(() => ({})));
    return c.json(registerDevice(body.success ? body.data.profile : {}), 201);
  });

  app.get("/api/devices/me", async (c) => {
    const device = authDevice(c.req.header("x-device-id"), c.req.header("x-device-secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    return c.json(await composeState(device));
  });

  // EventSource cannot set headers, so the stream authenticates via query params.
  app.get("/api/devices/me/stream", (c) => {
    const device = authDevice(c.req.query("id"), c.req.query("secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    return streamSSE(c, async (stream) => {
      let open = true;
      const unsubscribe = subscribe(device.id, (event, data, id) =>
        stream.writeSSE({ event, data, id }),
      );
      stream.onAbort(() => {
        open = false;
        unsubscribe();
      });
      await pushDevice(device.id);
      while (open) {
        await stream.sleep(25_000);
        if (!open) break;
        await stream.writeSSE({ event: "ping", data: String(Date.now()) });
      }
    });
  });

  // ---- e-ink device protocol (BYOS): poll for a 1-bit image + refresh rate ----

  // A battery e-paper device calls this each wake: it reports telemetry (via
  // headers), and gets back where to fetch its image and how long to sleep.
  app.get("/api/devices/me/display", (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.query("id"), c.req.header("access-token") ?? c.req.query("secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    recordTelemetry(device.id, telemetryFromHeaders(c));
    const refresh = device.refresh_seconds;
    if (!device.claimed_at) {
      return c.json({ status: 0, claimed: false, claim_code: device.claim_code, refresh_rate: 300 });
    }
    const layoutId = currentLayoutId(device);
    const version = layoutId ? getLayout(layoutId)?.version ?? 0 : 0;
    return c.json({
      status: 0,
      claimed: true,
      image_url: `${baseUrl()}/api/devices/me/render.bmp?id=${device.id}&secret=${device.secret}&v=${version}`,
      filename: `glanceos-${layoutId ?? "blank"}-${version}.bmp`,
      refresh_rate: refresh,
      reset_firmware: false,
    });
  });

  app.get("/api/devices/me/render.bmp", async (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.query("id"), c.req.header("access-token") ?? c.req.query("secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    if (!(await renderAvailable())) {
      return c.json({ error: "render support not installed — run: pnpm --filter @glanceos/server exec playwright install chromium" }, 503);
    }
    const format = ((c.req.query("format") as RenderFormat) || "bmp") as RenderFormat;
    const profile = deviceProfile(device);
    const payload = await composeState(device);
    const layoutId = currentLayoutId(device);
    const version = layoutId ? getLayout(layoutId)?.version ?? 0 : 0;
    try {
      const { buf, contentType } = await renderImage(
        baseUrl(), payload, profile.width, profile.height, format, `dev:${device.id}:${layoutId}:${version}`,
      );
      return new Response(Uint8Array.from(buf), { status: 200, headers: { "content-type": contentType, "cache-control": "no-store" } });
    } catch (e) {
      return c.json({ error: String(e instanceof Error ? e.message : e) }, 500);
    }
  });

  app.post("/api/devices/me/telemetry", async (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.header("x-device-id"), c.req.header("access-token") ?? c.req.header("x-device-secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { battery?: number; rssi?: number; firmware?: string };
    recordTelemetry(device.id, { ...telemetryFromHeaders(c), ...body });
    return c.json({ ok: true });
  });

  // ---- screens (config plane) ----

  app.get("/api/devices", (c) => c.json(listDevices(c.get("userId")).map(deviceSummary)));

  app.post("/api/devices/claim", async (c) => {
    const body = ClaimRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "claim code required" }, 400);
    const device = claimDevice(body.data.code, body.data.name, c.get("userId"));
    if (!device) return c.json({ error: "unknown or already-claimed code" }, 404);
    await pushDevice(device.id); // the physical screen flips to "pick a setup"
    return c.json(deviceSummary(device));
  });

  app.patch("/api/devices/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string; layoutId?: number | null; refreshSeconds?: number; playlistId?: number | null;
    };
    // Assigning a playlist clears the single layout, and vice-versa.
    if (body.playlistId !== undefined) {
      if (body.playlistId !== null && !getOwnedPlaylist(body.playlistId, userId)) {
        return c.json({ error: "playlist not found" }, 404);
      }
      if (!setDevicePlaylist(id, body.playlistId, userId)) return c.json({ error: "device not found" }, 404);
      if (body.playlistId !== null) updateDevice(id, { layoutId: null }, userId);
    }
    if (body.refreshSeconds !== undefined && !setRefresh(id, body.refreshSeconds, userId)) {
      return c.json({ error: "device not found" }, 404);
    }
    if (body.name !== undefined || body.layoutId !== undefined) {
      const updated = updateDevice(id, body, userId);
      if (!updated) return c.json({ error: "device or setup not found" }, 404);
      if (body.layoutId !== undefined && body.layoutId !== null) setDevicePlaylist(id, null, userId);
    }
    const device = getDevice(id);
    if (!device || device.user_id !== userId) return c.json({ error: "device not found" }, 404);
    await pushDevice(device.id);
    return c.json(deviceSummary(device));
  });

  app.delete("/api/devices/:id", (c) => {
    if (!deleteDevice(c.req.param("id"), c.get("userId"))) {
      return c.json({ error: "device not found" }, 404);
    }
    return c.json({ ok: true });
  });

  // Time-of-day schedules + the device timezone (owner-scoped).
  app.get("/api/devices/:id/schedules", (c) => {
    const id = c.req.param("id");
    const device = getDevice(id);
    if (!device || device.user_id !== c.get("userId")) return c.json({ error: "device not found" }, 404);
    return c.json({ timezone: device.timezone, schedules: listSchedules(id) });
  });

  app.put("/api/devices/:id/schedules", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const device = getDevice(id);
    if (!device || device.user_id !== userId) return c.json({ error: "device not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { timezone?: string | null; schedules?: Schedule[] };
    if (body.timezone !== undefined) setDeviceTimezone(id, body.timezone, userId);
    if (Array.isArray(body.schedules)) setSchedules(id, body.schedules);
    await pushDevice(id);
    const updated = getDevice(id)!;
    return c.json({ timezone: updated.timezone, schedules: listSchedules(id) });
  });

  // ---- in-app notifications (offline / low-battery alerts) ----
  app.get("/api/notifications", (c) => {
    const userId = c.get("userId");
    return c.json({ notifications: listNotifications(userId, c.req.query("unread") === "1"), unread: unreadCount(userId) });
  });
  app.post("/api/notifications/:id/read", (c) => {
    markRead(Number(c.req.param("id")), c.get("userId"));
    return c.json({ ok: true, unread: unreadCount(c.get("userId")) });
  });
  app.post("/api/notifications/read-all", (c) => {
    markAllRead(c.get("userId"));
    return c.json({ ok: true, unread: 0 });
  });

  // Grayscale PNG preview of exactly what a screen would show on e-ink.
  app.get("/api/devices/:id/preview.png", async (c) => {
    const device = getDevice(c.req.param("id"));
    if (!device || device.user_id !== c.get("userId")) return c.json({ error: "not found" }, 404);
    if (!(await renderAvailable())) return c.json({ error: "render support not installed" }, 503);
    const profile = deviceProfile(device);
    const payload = await composeState(device);
    const layoutId = currentLayoutId(device);
    const version = layoutId ? getLayout(layoutId)?.version ?? 0 : 0;
    try {
      const { buf } = await renderImage(baseUrl(), payload, profile.width, profile.height, "png", `prev:${device.id}:${layoutId}:${version}`);
      return new Response(Uint8Array.from(buf), { status: 200, headers: { "content-type": "image/png", "cache-control": "no-store" } });
    } catch (e) {
      return c.json({ error: String(e instanceof Error ? e.message : e) }, 500);
    }
  });

  // ---- playlists ----

  app.get("/api/playlists", (c) => c.json(listPlaylists(c.get("userId"))));

  app.post("/api/playlists", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; intervalSeconds?: number };
    return c.json(createPlaylist(c.get("userId"), body.name ?? "Playlist", body.intervalSeconds ?? 300), 201);
  });

  app.patch("/api/playlists/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; intervalSeconds?: number; layoutIds?: number[] };
    const updated = updatePlaylist(Number(c.req.param("id")), c.get("userId"), body);
    if (!updated) return c.json({ error: "not found" }, 404);
    await pushRotatingDevices();
    return c.json(updated);
  });

  app.delete("/api/playlists/:id", (c) => {
    if (!deletePlaylist(Number(c.req.param("id")), c.get("userId"))) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });

  // ---- setups ----

  app.get("/api/layouts", (c) => c.json(listSetups(c.get("userId")).map(setupSummary)));

  app.post("/api/layouts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; document?: unknown };
    const name = body.name?.trim() || "Untitled setup";
    let document;
    if (body.document !== undefined) {
      const parsed = safeParseDocument(body.document); // accepts v1 imports, stores v2
      if (!parsed.success) return c.json({ error: "validation", issues: parsed.issues }, 400);
      document = { ...parsed.data, name };
    } else {
      document = blankDocument(name);
    }
    return c.json(createLayout(name, document, { userId: c.get("userId") }), 201);
  });

  app.post("/api/layouts/preview-state", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { document?: unknown };
    const parsed = safeParseDocument(body.document);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.issues }, 400);
    const userId = c.get("userId");
    return c.json({ data: await resolveWidgetData(parsed.data, userId, connLookupFor(userId)) });
  });

  // Dry-run a binding so the Data tab can preview what a source returns. Works
  // for anonymous URLs and for the caller's own saved connections (secrets stay
  // server-side — the response carries only the resolved data).
  app.post("/api/source/preview", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
    const parsed = BlockSource.safeParse(body.source);
    if (!parsed.success) return c.json({ error: "validation" }, 400);
    const userId = c.get("userId");
    return c.json({ data: await resolveSource(parsed.data, connLookupFor(userId)) });
  });

  // ---- integrations: provider catalog + per-user connections ----

  app.get("/api/providers", (c) =>
    c.json([...PROVIDERS.values()].map((p) => ({
      id: p.id, label: p.label, category: p.category, authKind: p.authKind, oauth: !!p.oauth,
      resources: p.resources.map((r) => ({ id: r.id, label: r.label, shape: r.shape })),
    }))));

  app.get("/api/connections", (c) => c.json(listConnections(c.get("userId"))));

  app.post("/api/connections", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { provider?: string; label?: string; config?: Record<string, unknown>; secret?: string };
    if (!body.provider) return c.json({ error: "provider required" }, 400);
    const created = createConnection(c.get("userId"), { provider: body.provider, label: body.label, config: body.config, secret: body.secret });
    if (!created) return c.json({ error: "unknown provider" }, 400);
    return c.json(created, 201);
  });

  app.patch("/api/connections/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { label?: string; config?: Record<string, unknown>; secret?: string };
    const updated = updateConnection(c.req.param("id"), c.get("userId"), body);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json(updated);
  });

  app.delete("/api/connections/:id", (c) =>
    deleteConnection(c.req.param("id"), c.get("userId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // Preview a resource of a saved connection (secrets never returned).
  app.post("/api/connections/:id/sample", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    if (!getConnectionSummary(id, userId)) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
    const parsed = BlockSource.safeParse({ ...(body.source ?? {}), connectionId: id });
    if (!parsed.success) return c.json({ error: "validation" }, 400);
    return c.json({ data: await resolveSource(parsed.data, connLookupFor(userId)) });
  });

  // ---- OAuth: the self-hoster's app credentials (secret sealed, never returned) ----
  app.get("/api/oauth-apps/:provider", (c) =>
    c.json(getOAuthAppSummary(c.get("userId"), c.req.param("provider")) ?? { hasApp: false }));

  app.put("/api/oauth-apps/:provider", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { clientId?: string; clientSecret?: string };
    if (!body.clientId || !body.clientSecret) return c.json({ error: "clientId and clientSecret required" }, 400);
    setOAuthApp(c.get("userId"), c.req.param("provider"), body.clientId, body.clientSecret);
    return c.json({ ok: true });
  });

  app.delete("/api/oauth-apps/:provider", (c) => {
    deleteOAuthApp(c.get("userId"), c.req.param("provider"));
    return c.json({ ok: true });
  });

  // ---- OAuth flow: redirect to provider, then handle the callback ----
  app.get("/api/oauth/:provider/start", (c) => {
    const provider = c.req.param("provider");
    const redirectUri = `${publicBase(c)}/api/oauth/${provider}/callback`;
    try {
      return c.redirect(buildAuthorizeUrl(c.get("userId"), provider, redirectUri));
    } catch (e) {
      if (e instanceof NoOAuthApp) return c.json({ error: "no_oauth_app", provider }, 412);
      return c.json({ error: "oauth_unavailable" }, 400);
    }
  });

  app.get("/api/oauth/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const back = (status: string) => c.redirect(`/#/integrations?oauth=${status}`);
    if (c.req.query("error") || !code || !state) return back("denied");
    const redirectUri = `${publicBase(c)}/api/oauth/${provider}/callback`;
    const result = await completeOAuth(c.get("userId"), provider, code, state, redirectUri);
    return back(result.ok ? "connected" : `error:${result.error ?? "unknown"}`);
  });

  app.get("/api/layouts/:id", (c) => {
    const layout = getOwnedLayout(Number(c.req.param("id")), c.get("userId"));
    if (!layout) return c.json({ error: "not found" }, 404);
    return c.json(layout);
  });

  app.put("/api/layouts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("userId"))) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { document?: unknown };
    const parsed = safeParseDocument(body.document);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.issues }, 400);
    const updated = updateLayout(id, parsed.data)!;
    await pushDevicesUsingLayout(id);
    return c.json({ id: updated.id, version: updated.version });
  });

  app.patch("/api/layouts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("userId"))) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string; description?: string; published?: boolean;
    };
    const updated = updateLayoutMeta(id, body)!;
    return c.json(updated);
  });

  app.post("/api/layouts/:id/duplicate", (c) => {
    const copy = duplicateLayout(Number(c.req.param("id")), c.get("userId"));
    if (!copy) return c.json({ error: "not found" }, 404);
    return c.json(copy, 201);
  });

  app.delete("/api/layouts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("userId"))) return c.json({ error: "not found" }, 404);
    const affected = deleteLayout(id);
    await pushDeviceIds(affected); // those screens fall back to "pick a setup"
    return c.json({ ok: true });
  });

  // ---- public read-only share links ----
  const shareLink = (c: Context, token: string) => `${publicBase(c)}/screen/?share=${token}`;

  app.get("/api/layouts/:id/share", (c) => {
    const token = getShareToken(Number(c.req.param("id")), c.get("userId"));
    return c.json({ token, url: token ? shareLink(c, token) : null });
  });

  app.post("/api/layouts/:id/share", (c) => {
    const token = setShareToken(Number(c.req.param("id")), c.get("userId"));
    if (!token) return c.json({ error: "not found" }, 404);
    return c.json({ token, url: shareLink(c, token) });
  });

  app.delete("/api/layouts/:id/share", (c) => {
    clearShareToken(Number(c.req.param("id")), c.get("userId"));
    return c.json({ ok: true });
  });

  // Public board state (no auth) — resolves live data under the OWNER's connections.
  app.get("/api/public/board/:token", async (c) => {
    const found = getLayoutByShareToken(c.req.param("token"));
    if (!found) return c.json({ error: "not found" }, 404);
    const { record, ownerId } = found;
    const data = await resolveWidgetData(record.document, ownerId ?? "", ownerId ? connLookupFor(ownerId) : undefined);
    return c.json({ claimed: true, state: { layoutVersion: record.version, layout: record.document, data, deviceName: record.name } });
  });

  // ---- template hub ----

  app.get("/api/hub", (c) => c.json(listPublished(c.req.query("q"))));

  app.post("/api/hub/:id/import", async (c) => {
    const copy = importFromHub(Number(c.req.param("id")), c.get("userId"));
    if (!copy) return c.json({ error: "not found" }, 404);
    return c.json(copy, 201);
  });

  // ---- tasks (the widget's backing store) ----

  app.get("/api/tasks", (c) =>
    c.json(listTasks(c.get("userId"), c.req.query("listId") ?? "default")),
  );

  app.post("/api/tasks", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { listId?: string; text?: string };
    if (!body.text?.trim()) return c.json({ error: "text required" }, 400);
    const item = addTask(c.get("userId"), body.listId ?? "default", body.text.trim());
    await pushUserDevices(c.get("userId"));
    return c.json(item, 201);
  });

  app.patch("/api/tasks/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: string; done?: boolean };
    if (!updateTask(c.get("userId"), Number(c.req.param("id")), body)) {
      return c.json({ error: "not found" }, 404);
    }
    await pushUserDevices(c.get("userId"));
    return c.json({ ok: true });
  });

  app.delete("/api/tasks/:id", async (c) => {
    if (!deleteTask(c.get("userId"), Number(c.req.param("id")))) {
      return c.json({ error: "not found" }, 404);
    }
    await pushUserDevices(c.get("userId"));
    return c.json({ ok: true });
  });

  // ---- queues (clinic board; the operator page calls advance) ----

  app.get("/api/queues/:id", (c) => c.json(getQueue(c.get("userId"), c.req.param("id"))));

  app.post("/api/queues/:id/advance", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { delta?: number };
    const q = advanceQueue(
      c.get("userId"),
      c.req.param("id"),
      Number.isFinite(body.delta) ? Number(body.delta) : 1,
    );
    await pushUserDevices(c.get("userId"));
    return c.json(q);
  });

  app.post("/api/queues/:id/waiting", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { delta?: number };
    const q = adjustWaiting(
      c.get("userId"),
      c.req.param("id"),
      Number.isFinite(body.delta) ? Number(body.delta) : 1,
    );
    await pushUserDevices(c.get("userId"));
    return c.json(q);
  });

  app.post("/api/queues/:id/reset", async (c) => {
    const q = resetQueue(c.get("userId"), c.req.param("id"));
    await pushUserDevices(c.get("userId"));
    return c.json(q);
  });

  // ---- built frontends, when they exist: one process serves everything ----

  const screenDist = join(here, "..", "..", "screen", "dist");
  if (existsSync(screenDist)) {
    const root = relative(process.cwd(), screenDist);
    app.use(
      "/screen/*",
      serveStatic({ root, rewriteRequestPath: (p) => p.replace(/^\/screen/, "") || "/" }),
    );
    app.get("/screen", serveStatic({ path: join(root, "index.html") }));
  }
  const configDist = join(here, "..", "..", "config", "dist");
  if (existsSync(configDist)) {
    const root = relative(process.cwd(), configDist);
    app.use("/*", serveStatic({ root }));
    app.get("*", serveStatic({ path: join(root, "index.html") }));
  }

  return app;
}
