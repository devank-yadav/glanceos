import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Automation, BlockSource, ClaimRequest, RegisterRequest, UserLoginRequest, UserRegisterRequest, safeParseDocument,
} from "@glanceos/schema";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { compress } from "hono/compress";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import {
  changePassword, consumeAuthToken, createSession, createUser, deleteUser, destroyAllSessions, destroySession, getUser, getUserByEmail,
  isUserAdmin, markActivated, markEmailVerified, markOnboarded, mintAuthToken, registrationOpen, sessionUserId, setPassword, setUserBoardDefaults, setUserHome, setUserHomeLayout, updateUserName, updateUserTimezone, verifyLogin,
} from "./auth";
import { dauWau, funnelCounts, retentionD1D7, track } from "./analytics";
import { sendDay3Email, sendInviteEmail, sendResetEmail, sendVerifyEmail, sendWelcomeEmail } from "./emails";
import { dumpUser, importUser } from "./backup";
import { injectAbsoluteOg } from "./ogmeta";
import {
  createGroup, deleteGroup, getGroupRow, getOwnedGroup, listGroups, listGroupSchedules,
  setDeviceGroup, setGroupSchedules, updateGroup, type GroupSchedule,
} from "./groups";
import { playLogCsv, playLogForGroup, recordPlayLog, type PlayLogEntry } from "./playlog";
import { requestLogger } from "./logging";
import { hmacSign, hmacVerify } from "./secrets";
import {
  authDevice, batteryForecast, claimDevice, deleteDevice, deviceProfile, devicesOwnedBy, getDevice, listDevices, recordTelemetry, setLowBatterySwap,
  registerDevice, setDeviceLocation, setDeviceTimezone, setDeviceTvSettings, setRefresh, setRenderOpts,
  updateDevice, type DeviceProfile, type DeviceRow,
} from "./devices";
import { geocodeSearch, reverseGeocode } from "./fetchers/geocode";
import { listSchedules, setSchedules, type Schedule } from "./schedules";
import { clearAll, listNotifications, markAllRead, markRead, notifyClaimed, notifyContentChanged, unreadCount } from "./notifications";
import { dataDir, db } from "./db";
import { isAllowedMime, MAX_UPLOAD_BYTES, saveUpload, UPLOAD_QUOTA_BYTES, userUsage } from "./uploads";
import { limiter } from "./ratelimit";
import { emit, isConnected, subscribe } from "./hub";
import {
  blankDocument, clearShareToken, createLayout, deleteLayout, duplicateLayout, getLayout,
  getLayoutByShareToken, getLayoutVersionDocument, getOwnedLayout, getShareInfo, importFromHub,
  listLayoutVersions, listPendingTemplates,
  listPublished, listSetups, publishForReview, setArchived, setReviewStatus, setShareToken, setVersionLabel, shareExpired,
  updateLayout, updateLayoutMeta, verifySharePassword,
} from "./layouts";
import {
  createShare, getReadableLayout, getWritableLayout, listSharesByOwner, revokeShare, sharedLayouts, updateShareAccess,
} from "./shares";
import { isScope, listKeys, mintKey, resolveKey, revokeKey, SCOPES, type Scope } from "./apikeys";
import {
  acceptInvite, changeRole, createInvite, createOrg, deleteOrg, ensurePersonalOrg, getInvite,
  listInvites, listMembers, listOrgsForUser, memberRole, removeMember, renameOrg, resolveOrgForRequest, revokeInvite,
  ROLE_RANK, type Role, getOrg, isRole, setSessionActiveOrg,
} from "./orgs";
import { publicUrl } from "./email";
import { billingSummary, canAddScreen } from "./billing";
import { createCheckout, createPortal, handleWebhook, stripeConfigured } from "./stripe";
import { deleteCustomData, getCustomData, listCustomData, setCustomData, setDataPrivacy } from "./customdata";
import { metricSeries } from "./metrics";
import { getJournal, promptForDay, recentJournal, setJournal } from "./journal";
import { applyScene, captureScene, deleteScene, listScenes, renameScene } from "./scenes";
import { deleteOverride, listOverrides, overridesSig, setOverride } from "./deviceOverrides";
import {
  createInlet, deleteInlet, isSinkKind, listInlets, resolveInlet, routeInlet, type SinkKind, updateInlet, verifyInletSignature,
} from "./inlets";
import {
  countAutomations, createAutomation, deleteAutomation, getAutomation, listAutomations, listRuns, MAX_AUTOMATIONS_PER_USER, setAutomationEnabled, snoozeAutomation, updateAutomation,
} from "./automations";
import { dryRunAutomation, runAutomationById } from "./automation/engine";
import { advanceQueue, adjustWaiting, getQueue, resetQueue } from "./queues";
import { renderAvailable, renderImage, type RenderFormat, toDitherOpts } from "./render";
import {
  composeState, currentLayoutId, emitGroupCommand, pushDevice, pushDeviceIds, pushDevicesUsingLayout,
  pushGroupDevices, pushUserDevices, scheduledSig,
} from "./state";
import { addTask, deleteTask, listTasks, updateTask } from "./tasks";
import {
  connLookupForOrg, createConnection, deleteConnection, getConnectionSummary, listConnections, updateConnection,
} from "./connections";
import { buildAuthorizeUrl, completeOAuth, NoOAuthApp } from "./oauth";
import { deleteOAuthApp, getOAuthAppSummary, setOAuthApp } from "./oauth-apps";
import { PROVIDERS } from "./providers/registry";
import { resolveSource } from "./providers/resolve";
import { resolveWidgetData } from "./widgets";

const here = dirname(fileURLToPath(import.meta.url));

const baseUrl = (): string => `http://127.0.0.1:${process.env.PORT ?? 8080}`;

// Per-device display ETag + consecutive-unchanged-poll counter (in-memory, rebuilt
// on restart) — backs the /display endpoint's 304 + adaptive-refresh behavior.
const displayEtags = new Map<string, { etag: string; unchanged: number }>();
const ESCAPE_HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => ESCAPE_HTML[ch]!);

// Order-independent JSON so the display ETag is stable across composeState rebuilds.
function safeStableJson(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) =>
      val && typeof val === "object" && !Array.isArray(val)
        ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
        : val);
  } catch { return ""; }
}

// Public origin for OAuth redirect URIs — behind a reverse proxy the request
// origin is wrong, so GLANCEOS_PUBLIC_URL overrides it. Must match the redirect
// URI registered in the provider's OAuth app.
const publicBase = (c: Context): string =>
  process.env.GLANCEOS_PUBLIC_URL?.replace(/\/+$/, "") ?? new URL(c.req.url).origin;

const SESSION_COOKIE = "glanceos_session";
const CSRF_COOKIE = "glanceos_csrf";
// Self-hoster's Google Cast receiver Application ID (public id, not a secret).
// Empty → casting UI is hidden and the CSP stays strict.
const CAST_APP_ID = (process.env.GLANCEOS_CAST_APP_ID ?? "").trim();

// The device plane authenticates with deviceId+secret and must work unclaimed;
// everything else is the config plane and needs a user session.
const DEVICE_PLANE = new Set([
  "/api/devices/register",
  "/api/devices/me",
  "/api/devices/me/stream",
  "/api/devices/me/display",
  "/api/devices/me/render.bmp",
  "/api/devices/me/telemetry",
  "/api/devices/me/play-log",
  "/api/devices/me/action", // #10 — a board button tap fires an automation (device-auth)
]);

type Env = { Variables: { userId: string; orgId: string; role: Role; principal: "session" | "apikey"; scopes: string[] } };

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
    online: isConnected(d.id),
    refreshSeconds: d.refresh_seconds,
    battery: d.battery,
    batteryForecast: batteryForecast(d),
    rssi: d.rssi,
    firmware: d.firmware,
    lastSeen: d.last_seen,
    resolution: `${profile.width}×${profile.height}`,
    timezone: d.timezone,
    locationName: d.location_name,
    latitude: d.latitude,
    longitude: d.longitude,
    renderOpts: safeJsonObj(d.render_opts),
    tv: { tvMode: !!profile.tvMode, safeArea: profile.safeArea, burnIn: profile.burnIn, wake: profile.wake, quietHours: profile.quietHours },
    lowBattery: profile.lowBattery ?? null, // #58 — low-battery board swap config
    lowBatteryName: profile.lowBattery ? getLayout(profile.lowBattery.layoutId)?.name ?? null : null,
    platform: profile.platform ?? null,
    nativeVersion: profile.nativeVersion ?? null,
    groupId: d.group_id,
    groupName: d.group_id ? getGroupRow(d.group_id)?.name ?? null : null,
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

  app.use("*", requestLogger()); // opt-in JSON request log (GLANCEOS_LOG=json)

  // ---- liveness/readiness probes (before the API guard; no auth) ----
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/ready", (c) => {
    try { db.prepare("SELECT 1").get(); return c.json({ ready: true }); }
    catch { return c.json({ ready: false }, 503); }
  });

  // ---- launch hardening: Secure cookies behind TLS + opaque 500s ----
  // Cookies get Secure (and we emit HSTS) only when actually served over https
  // — gating on GLANCEOS_PUBLIC_URL=https… (or GLANCEOS_SECURE_COOKIES=on) so a
  // plain-http local/dev box still works. 500s return a generic message + a
  // correlation ref (logged server-side) instead of leaking internal/DB detail.
  const SECURE_COOKIES =
    (process.env.GLANCEOS_PUBLIC_URL ?? "").startsWith("https") || process.env.GLANCEOS_SECURE_COOKIES === "on";
  const serverError = (c: Context, e: unknown): Response => {
    const ref = randomUUID().slice(0, 8);
    console.error(`[500 ${ref}]`, e);
    return c.json({ error: "internal error", ref }, 500);
  };

  // ---- security headers (+ CSP on document/asset responses) ----
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (SECURE_COOKIES) c.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    const path = c.req.path;
    if (!path.startsWith("/api") && !path.startsWith("/uploads")) {
      // Casting (opt-in) needs the Google Cast SDKs from gstatic; only widen the
      // policy when an App ID is configured — strict 'self' by default.
      const cast = CAST_APP_ID ? " https://www.gstatic.com" : "";
      c.header(
        "Content-Security-Policy",
        // 'self' scripts/styles; the studio embeds /screen in an iframe (frame-src);
        // SSE + fetch are same-origin (connect-src); boards may show remote images.
        `default-src 'self'; script-src 'self'${cast}; style-src 'self' 'unsafe-inline'; ` +
        `img-src 'self' data: blob: https: http:; connect-src 'self'${cast}; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'`,
      );
    }
  });

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

  // A session's CSRF token is HMAC(session token) — stateless double-submit. The
  // server sets it in a readable (non-HttpOnly) cookie at login; the config app
  // echoes it in x-csrf-token on every mutating call. A cross-site page can read
  // neither the cookie nor set the header, so forged POST/PUT/PATCH/DELETE fail.
  const csrfFor = (sessionToken: string) => hmacSign(`csrf:${sessionToken}`);
  const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  // The ONLY endpoints reachable with an API key (deny-by-default — every other
  // /api/* route stays session-only). A session implicitly has every scope.
  const API_ALLOW: Array<{ m: string; re: RegExp; scope: Scope }> = [
    { m: "GET", re: /^\/api\/tasks$/, scope: "tasks:read" },
    { m: "POST", re: /^\/api\/tasks$/, scope: "tasks:write" },
    { m: "PATCH", re: /^\/api\/tasks\/[^/]+$/, scope: "tasks:write" },
    { m: "DELETE", re: /^\/api\/tasks\/[^/]+$/, scope: "tasks:write" },
    { m: "GET", re: /^\/api\/queues\/[^/]+$/, scope: "queues:write" },
    { m: "POST", re: /^\/api\/queues\/[^/]+\/(advance|waiting|reset)$/, scope: "queues:write" },
    { m: "GET", re: /^\/api\/devices$/, scope: "devices:read" },
    { m: "GET", re: /^\/api\/layouts$/, scope: "layouts:read" },
    { m: "GET", re: /^\/api\/layouts\/\d+$/, scope: "layouts:read" },
    { m: "POST", re: /^\/api\/data\/[^/]+$/, scope: "data:write" }, // custom-data inlet (Phase 2)
  ];

  // Principal resolver: Bearer API key (CSRF-immune), then session cookie (CSRF on
  // mutations), else 401. Webhooks + public + device + auth do their own thing.
  app.use("/api/*", async (c, next) => {
    const path = c.req.path;
    if (path.startsWith("/api/auth/") || path.startsWith("/api/public/") || path.startsWith("/api/hooks/") || DEVICE_PLANE.has(path)) return next();

    const auth = c.req.header("authorization");
    if (auth?.startsWith("Bearer ")) {
      const resolved = resolveKey(auth.slice(7).trim());
      if (!resolved) return c.json({ error: "invalid API key" }, 401);
      const rule = API_ALLOW.find((r) => r.m === c.req.method && r.re.test(path));
      if (!rule) return c.json({ error: "this endpoint isn't available to API keys" }, 403);
      if (!resolved.scopes.includes(rule.scope)) return c.json({ error: `API key is missing the "${rule.scope}" scope` }, 403);
      c.set("userId", resolved.userId);
      c.set("orgId", resolved.orgId ?? ensurePersonalOrg(resolved.userId)); // key's data scope (self-heal if unset)
      c.set("role", "editor"); // API keys can act on content, never manage members
      c.set("scopes", resolved.scopes);
      c.set("principal", "apikey");
      return next();
    }

    const sessionToken = getCookie(c, SESSION_COOKIE);
    const userId = sessionUserId(sessionToken);
    if (!userId || !sessionToken) return c.json({ error: "unauthorized" }, 401);
    if (MUTATING.has(c.req.method) && !hmacVerify(`csrf:${sessionToken}`, c.req.header("x-csrf-token") ?? "")) {
      return c.json({ error: "bad or missing CSRF token" }, 403);
    }
    const { orgId, role } = resolveOrgForRequest(userId, sessionToken); // active workspace + role (self-healing)
    c.set("userId", userId);
    c.set("orgId", orgId);
    c.set("role", role);
    c.set("principal", "session");
    return next();
  });

  // ---- rate limits (in-memory; GLANCEOS_RATE_LIMIT=off disables) ----
  const deviceKey = (c: Context) => c.req.query("id") || c.req.header("id") || c.req.header("x-device-id") || "anon";
  const userKey = (c: Context) => c.get("userId") || "anon";
  app.use("/api/auth/login", limiter("auth", 10, 60_000));
  app.use("/api/auth/register", limiter("auth", 10, 60_000));
  app.use("/api/auth/forgot", limiter("auth", 6, 60_000));
  app.use("/api/auth/reset", limiter("auth", 10, 60_000));
  app.use("/api/auth/verify/request", limiter("auth", 6, 60_000));
  app.use("/api/devices/register", limiter("register", 30, 60_000));
  app.use("/api/devices/claim", limiter("claim", 30, 60_000));
  app.use("/api/devices/me/display", limiter("display", 120, 60_000, deviceKey));
  app.use("/api/devices/me/telemetry", limiter("telemetry", 120, 60_000, deviceKey));
  app.use("/api/devices/me/play-log", limiter("play-log", 120, 60_000, deviceKey));
  app.use("/api/devices/me/action", limiter("action", 60, 60_000, deviceKey)); // #10 — cap button-tap spam
  app.use("/api/layouts/preview-state", limiter("preview", 120, 60_000, userKey));
  app.use("/api/source/preview", limiter("preview", 120, 60_000, userKey));
  app.use("/api/geocode", limiter("geocode", 60, 60_000, userKey));
  app.use("/api/reverse-geocode", limiter("revgeo", 60, 60_000, userKey));
  app.use("/api/uploads", limiter("upload", 30, 60_000, userKey));
  app.use("/api/data", limiter("data", 120, 60_000, userKey));
  app.use("/api/inlets", limiter("inlets", 60, 60_000, userKey));
  app.use("/api/automations", limiter("automations", 60, 60_000, userKey));
  app.use("/api/hooks/*", limiter("hooks", 240, 60_000, (c) => c.req.path)); // per-secret (the path)
  // Public (unauthenticated) share endpoints: throttle scraping per IP, and
  // throttle share-board password guesses per board token (brute-force defense).
  app.use("/api/public/*", limiter("public", 240, 60_000));
  app.use("/api/public/board/:token/unlock", limiter("unlock", 12, 60_000, (c) => c.req.param("token") || "?"));
  // Account mutations are brute-force / abuse targets: cap per user.
  app.use("/api/account/password", limiter("acct-pw", 5, 60_000, userKey));
  app.use("/api/account/api-keys", limiter("apikeys", 20, 60_000, userKey));
  app.use("/api/account", async (c, next) => (c.req.method === "DELETE" ? limiter("acct-del", 5, 60 * 60_000, userKey)(c, next) : next()));

  const issueSession = (c: Context, userId: string) => {
    const session = createSession(userId);
    const maxAge = Math.floor((session.expiresAt - Date.now()) / 1000);
    setCookie(c, SESSION_COOKIE, session.token, { httpOnly: true, secure: SECURE_COOKIES, sameSite: "Lax", path: "/", maxAge });
    setCookie(c, CSRF_COOKIE, csrfFor(session.token), { httpOnly: false, secure: SECURE_COOKIES, sameSite: "Lax", path: "/", maxAge }); // readable by the config app
  };

  // ---- auth ----

  app.get("/api/auth/status", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    const userId = sessionUserId(token);
    const user = userId ? getUser(userId) : null;
    let activeOrg: { id: string; name: string; slug: string; personal: boolean; plan: string } | null = null;
    let role: Role | null = null;
    let orgs: ReturnType<typeof listOrgsForUser> = [];
    if (userId) {
      const r = resolveOrgForRequest(userId, token);
      role = r.role;
      orgs = listOrgsForUser(userId);
      const o = getOrg(r.orgId);
      if (o) activeOrg = { id: o.id, name: o.name, slug: o.slug, personal: o.personal === 1, plan: o.plan };
    }
    return c.json({ authed: !!user, user, activeOrg, role, orgs, registrationOpen: registrationOpen(), castAppId: CAST_APP_ID || null });
  });

  app.post("/api/auth/register", async (c) => {
    if (!registrationOpen()) return c.json({ error: "registration is closed on this server" }, 403);
    const body = UserRegisterRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "validation", issues: body.error.issues }, 400);
    const user = createUser(body.data.name, body.data.email, body.data.password);
    if (!user) return c.json({ error: "that email is already registered" }, 409);
    const personalOrg = ensurePersonalOrg(user.id); // give the new account its workspace up front
    issueSession(c, user.id);
    track("signup", { userId: user.id, orgId: personalOrg });
    void sendWelcomeEmail(user.email, user.name); // fire-and-forget; inert without a mail backend
    void sendVerifyEmail(user.email, user.name, mintAuthToken(user.id, "verify"));
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
    deleteCookie(c, CSRF_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // Password reset (request → emailed link → set new). Always returns ok so the form
  // can't be used to probe which emails exist. Inert without a mail backend.
  app.post("/api/auth/forgot", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: string };
    const u = body.email ? getUserByEmail(body.email) : null;
    if (u) void sendResetEmail(u.email, u.name, mintAuthToken(u.id, "reset"));
    return c.json({ ok: true });
  });
  app.post("/api/auth/reset", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { token?: string; password?: string };
    if (!body.token || !body.password || body.password.length < 8) return c.json({ error: "a token and a password (8+ chars) are required" }, 400);
    const userId = consumeAuthToken(body.token, "reset");
    if (!userId) return c.json({ error: "this reset link is invalid or expired" }, 400);
    setPassword(userId, body.password);
    destroyAllSessions(userId); // a reset logs out every existing session
    return c.json({ ok: true });
  });

  // Email verification (soft — never blocks login; just clears the "unverified" banner).
  app.get("/api/auth/verify/:token", (c) => {
    const userId = consumeAuthToken(c.req.param("token"), "verify");
    if (userId) markEmailVerified(userId);
    // Bounce to the app either way; the client shows a confirmation/expired note.
    return c.redirect(`/#/verified${userId ? "" : "?expired=1"}`);
  });
  app.post("/api/auth/verify/request", (c) => {
    const userId = sessionUserId(getCookie(c, SESSION_COOKIE));
    const u = userId ? getUser(userId) : null;
    if (u && !u.emailVerified) void sendVerifyEmail(u.email, u.name, mintAuthToken(u.id, "verify"));
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
  app.get("/api/devices/me/display", async (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.query("id"), c.req.header("access-token") ?? c.req.query("secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    recordTelemetry(device.id, telemetryFromHeaders(c));
    if (!device.claimed_at) {
      return c.json({ status: 0, claimed: false, claim_code: device.claim_code, refresh_rate: 300 });
    }
    const layoutId = currentLayoutId(device);
    const version = layoutId ? getLayout(layoutId)?.version ?? 0 : 0;
    // v6.1 e-ink efficiency: an ETag over (layout version + resolved data) lets a
    // panel skip a wake's render+transfer when nothing changed, and we stretch its
    // sleep after several unchanged polls. Opt-in + backward-compatible: a firmware
    // that doesn't send If-None-Match gets the old always-200 + base refresh.
    const payload = await composeState(device, undefined, { commit: false }); // ETag probe; render.bmp commits the "since you looked" baseline
    const dataJson = payload.claimed ? safeStableJson(payload.state.data) : "";
    // #48 — fold the per-device override fingerprint in: overrides live outside the layout (no
    // version bump) and a non-data-bound prop override leaves `data` unchanged, so without this an
    // e-ink panel would 304 and keep a stale render after an override change.
    const ovSig = overridesSig(device.id);
    // #80 — also fold in which scheduled blocks are active now, so an e-ink panel re-renders at a
    // per-block schedule boundary (the flip is screen-side, so version+data alone wouldn't notice).
    const schedSig = payload.claimed && payload.state.layout ? scheduledSig(payload.state.layout) : "";
    const etag = `W/"${layoutId ?? 0}.${version}.${createHash("sha1").update(dataJson).update(" ").update(ovSig).update("|").update(schedSig).digest("hex").slice(0, 16)}"`;
    const ifNone = c.req.header("if-none-match");
    const conditional = ifNone !== undefined;
    const prev = displayEtags.get(device.id);
    const unchanged = prev && prev.etag === etag ? prev.unchanged + 1 : 0;
    displayEtags.set(device.id, { etag, unchanged });
    const refresh = conditional && unchanged >= 3 ? Math.min(device.refresh_seconds * 4, 6 * 3600) : device.refresh_seconds;
    if (conditional && ifNone === etag) {
      return new Response(null, { status: 304, headers: { etag, "cache-control": "no-cache", "x-refresh-rate": String(refresh) } });
    }
    return c.json({
      status: 0,
      claimed: true,
      image_url: `${baseUrl()}/api/devices/me/render.bmp?id=${device.id}&secret=${device.secret}&v=${version}${ovSig ? `&o=${ovSig}` : ""}`, // #48 — bust the image cache on an override change too
      filename: `glanceos-${layoutId ?? "blank"}-${version}.bmp`,
      refresh_rate: refresh,
      reset_firmware: false,
    }, 200, { etag, "cache-control": "no-cache" });
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
        baseUrl(), payload, profile.width, profile.height, format, `dev:${device.id}:${layoutId}:${version}`, toDitherOpts(safeJsonObj(device.render_opts)),
      );
      return new Response(Uint8Array.from(buf), { status: 200, headers: { "content-type": contentType, "cache-control": "no-store" } });
    } catch (e) {
      return serverError(c, e);
    }
  });

  app.post("/api/devices/me/telemetry", async (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.header("x-device-id"), c.req.header("access-token") ?? c.req.header("x-device-secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { battery?: number; rssi?: number; firmware?: string };
    recordTelemetry(device.id, { ...telemetryFromHeaders(c), ...body });
    return c.json({ ok: true });
  });

  // Proof-of-play: a screen reports what it showed (single object or a batch).
  app.post("/api/devices/me/play-log", async (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.header("x-device-id"), c.req.header("access-token") ?? c.req.header("x-device-secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { entries?: PlayLogEntry[] } | PlayLogEntry | PlayLogEntry[];
    const entries: PlayLogEntry[] = Array.isArray(body) ? body : Array.isArray((body as { entries?: PlayLogEntry[] }).entries) ? (body as { entries: PlayLogEntry[] }).entries : [body as PlayLogEntry];
    const written = recordPlayLog(device.id, entries, Date.now());
    return c.json({ ok: true, written });
  });

  // #10 — a board button tap fires one of the owner's automations on demand. Device-auth; the
  // fire is user-scoped (runAutomationById → getAutomation(id, ownerId)), so a screen can only
  // trigger automations belonging to the account that owns it — never another user's.
  app.post("/api/devices/me/action", async (c) => {
    const device = authDevice(c.req.header("id") ?? c.req.header("x-device-id"), c.req.header("access-token") ?? c.req.header("x-device-secret"));
    if (!device) return c.json({ error: "unauthorized" }, 401);
    if (!device.user_id) return c.json({ error: "unclaimed" }, 403);
    const { automationId } = (await c.req.json().catch(() => ({}))) as { automationId?: string };
    if (!automationId) return c.json({ error: "automationId required" }, 400);
    try { return c.json(await runAutomationById(automationId, device.user_id)); }
    catch { return c.json({ error: "automation not found" }, 404); }
  });

  // ---- screens (config plane) ----

  app.get("/api/devices", (c) => c.json(listDevices(c.get("orgId")).map(deviceSummary)));

  app.post("/api/devices/claim", async (c) => {
    const body = ClaimRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "claim code required" }, 400);
    if (!canAddScreen(c.get("orgId"))) return c.json({ error: "This workspace has reached its screen limit. Upgrade to connect more screens.", upgrade: true }, 409);
    const device = claimDevice(body.data.code, body.data.name, c.get("userId"), c.get("orgId"));
    if (!device) return c.json({ error: "unknown or already-claimed code" }, 404);
    notifyClaimed(c.get("userId"), device.id, device.name);
    track("screen_claimed", { userId: c.get("userId"), orgId: c.get("orgId") });
    await pushDevice(device.id); // the physical screen flips to "pick a setup"
    return c.json(deviceSummary(device));
  });

  app.patch("/api/devices/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const orgId = c.get("orgId");
    const prior = getDevice(id);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string; layoutId?: number | null; refreshSeconds?: number; renderOpts?: Record<string, unknown>;
      tv?: { tvMode?: boolean; safeArea?: DeviceProfile["safeArea"]; burnIn?: DeviceProfile["burnIn"]; wake?: DeviceProfile["wake"] | null; quietHours?: DeviceProfile["quietHours"] | null };
      groupId?: number | null;
      timezone?: string | null;
      location?: { name: string; latitude: number; longitude: number } | null;
      lowBattery?: { layoutId: number | null; pct?: number };
    };
    if (body.timezone !== undefined && !setDeviceTimezone(id, body.timezone, orgId)) {
      return c.json({ error: "device not found or invalid timezone" }, 400);
    }
    if (body.location !== undefined && !setDeviceLocation(id, body.location, orgId)) {
      return c.json({ error: "device not found or invalid location" }, 400);
    }
    if (body.renderOpts !== undefined) {
      // validate/clamp via toDitherOpts so junk can't reach the render pipeline
      if (!setRenderOpts(id, { ...toDitherOpts(body.renderOpts) }, orgId)) return c.json({ error: "device not found" }, 404);
    }
    if (body.tv !== undefined) {
      if (!setDeviceTvSettings(id, orgId, body.tv)) return c.json({ error: "device not found" }, 404);
    }
    if (body.lowBattery !== undefined) {
      // #58 — validate the swap board is one this org owns before storing it (no cross-org refs).
      if (body.lowBattery.layoutId != null && !getOwnedLayout(body.lowBattery.layoutId, orgId)) return c.json({ error: "board not found" }, 404);
      if (!setLowBatterySwap(id, orgId, body.lowBattery.layoutId, body.lowBattery.pct)) return c.json({ error: "device not found" }, 404);
    }
    if (body.groupId !== undefined) {
      if (!setDeviceGroup(id, body.groupId, userId)) return c.json({ error: "device or group not found" }, 404);
    }
    if (body.refreshSeconds !== undefined && !setRefresh(id, body.refreshSeconds, orgId)) {
      return c.json({ error: "device not found" }, 404);
    }
    if (body.name !== undefined || body.layoutId !== undefined) {
      const updated = updateDevice(id, body, orgId);
      if (!updated) return c.json({ error: "device or setup not found" }, 404);
    }
    const device = getDevice(id);
    if (!device || device.org_id !== orgId) return c.json({ error: "device not found" }, 404);
    // Notify only on a genuine content change (assignment differs from before).
    if (body.layoutId !== undefined && body.layoutId !== null && body.layoutId !== prior?.layout_id) {
      notifyContentChanged(userId, id, device.name, getOwnedLayout(body.layoutId, orgId)?.name ?? "a board");
      track("board_assigned_to_screen", { userId, orgId });
      if (markActivated(userId)) track("activated", { userId, orgId }); // first board → a real screen = the aha moment
    }
    await pushDevice(device.id);
    return c.json(deviceSummary(device));
  });

  app.delete("/api/devices/:id", (c) => {
    if (!deleteDevice(c.req.param("id"), c.get("orgId"))) {
      return c.json({ error: "device not found" }, 404);
    }
    return c.json({ ok: true });
  });

  // ---- #48 per-device block overrides (this screen shows different props for a block) ----
  const ownDevice = (c: Context) => { const d = getDevice(c.req.param("id") ?? ""); return d && d.org_id === c.get("orgId") ? d : null; };
  app.get("/api/devices/:id/overrides", (c) => {
    const d = ownDevice(c); return d ? c.json(listOverrides(d.id)) : c.json({ error: "device not found" }, 404);
  });
  app.put("/api/devices/:id/overrides/:blockId", async (c) => {
    const d = ownDevice(c);
    if (!d) return c.json({ error: "device not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { props?: unknown };
    setOverride(d.id, c.req.param("blockId"), body.props ?? {});
    await pushDevice(d.id); // this screen re-renders with the override merged in
    return c.json({ ok: true });
  });
  app.delete("/api/devices/:id/overrides/:blockId", async (c) => {
    const d = ownDevice(c);
    if (!d) return c.json({ error: "device not found" }, 404);
    deleteOverride(d.id, c.req.param("blockId"));
    await pushDevice(d.id);
    return c.json({ ok: true });
  });

  // Send a live command to a single owned screen (Remote: reload / identify).
  const DEVICE_COMMANDS = new Set(["reload", "identify"]);
  app.post("/api/devices/:id/command", async (c) => {
    const id = c.req.param("id");
    const device = getDevice(id);
    if (!device || device.org_id !== c.get("orgId")) return c.json({ error: "device not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { command?: string; params?: Record<string, unknown> };
    if (!body.command || !DEVICE_COMMANDS.has(body.command)) return c.json({ error: "unknown command" }, 400);
    const delivered = isConnected(id) ? 1 : 0;
    if (delivered) await emit(id, "command", { command: body.command, params: body.params ?? {} });
    return c.json({ ok: true, delivered });
  });

  // Time-of-day schedules + the device timezone (owner-scoped).
  app.get("/api/devices/:id/schedules", (c) => {
    const id = c.req.param("id");
    const device = getDevice(id);
    if (!device || device.org_id !== c.get("orgId")) return c.json({ error: "device not found" }, 404);
    return c.json({ timezone: device.timezone, schedules: listSchedules(id) });
  });

  app.put("/api/devices/:id/schedules", async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const device = getDevice(id);
    if (!device || device.org_id !== orgId) return c.json({ error: "device not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { timezone?: string | null; schedules?: Schedule[] };
    if (body.timezone !== undefined) setDeviceTimezone(id, body.timezone, orgId);
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
  app.post("/api/notifications/clear-all", (c) => {
    clearAll(c.get("userId"));
    return c.json({ ok: true, unread: 0 });
  });

  // Grayscale PNG preview of exactly what a screen would show on e-ink.
  app.get("/api/devices/:id/preview.png", async (c) => {
    const device = getDevice(c.req.param("id"));
    if (!device || device.user_id !== c.get("userId")) return c.json({ error: "not found" }, 404);
    if (!(await renderAvailable())) return c.json({ error: "render support not installed" }, 503);
    const profile = deviceProfile(device);
    const payload = await composeState(device, undefined, { commit: false }); // owner preview — never consumes the device's baseline
    const layoutId = currentLayoutId(device);
    const version = layoutId ? getLayout(layoutId)?.version ?? 0 : 0;
    try {
      const { buf } = await renderImage(baseUrl(), payload, profile.width, profile.height, "png", `prev:${device.id}:${layoutId}:${version}`, toDitherOpts(safeJsonObj(device.render_opts)));
      return new Response(Uint8Array.from(buf), { status: 200, headers: { "content-type": "image/png", "cache-control": "no-store" } });
    } catch (e) {
      return serverError(c, e);
    }
  });

  // ---- display groups (signage) ----

  app.get("/api/groups", (c) => c.json(listGroups(c.get("userId"))));

  app.post("/api/groups", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; timezone?: string | null };
    if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
    return c.json(createGroup(c.get("userId"), body.name, body.timezone ?? null), 201);
  });

  app.patch("/api/groups/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; timezone?: string | null; layoutId?: number | null };
    const updated = updateGroup(Number(c.req.param("id")), c.get("userId"), body);
    if (!updated) return c.json({ error: "not found" }, 404);
    await pushGroupDevices(updated.id);
    return c.json(updated);
  });

  app.delete("/api/groups/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedGroup(id, c.get("userId"))) return c.json({ error: "not found" }, 404);
    deleteGroup(id, c.get("userId"));
    await pushGroupDevices(id); // members fall back to their own settings
    return c.json({ ok: true });
  });

  app.get("/api/groups/:id/schedules", (c) => {
    const g = getOwnedGroup(Number(c.req.param("id")), c.get("userId"));
    if (!g) return c.json({ error: "not found" }, 404);
    return c.json({ timezone: g.timezone, schedules: listGroupSchedules(g.id) });
  });

  app.put("/api/groups/:id/schedules", async (c) => {
    const g = getOwnedGroup(Number(c.req.param("id")), c.get("userId"));
    if (!g) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { schedules?: GroupSchedule[] };
    setGroupSchedules(g.id, Array.isArray(body.schedules) ? body.schedules : []);
    await pushGroupDevices(g.id);
    return c.json({ schedules: listGroupSchedules(g.id) });
  });

  // Fleet command: deliver an instant action to every live screen in a group.
  const FLEET_COMMANDS = new Set(["reload", "identify", "clear-cache", "screenshot-now"]);
  app.post("/api/groups/:id/command", async (c) => {
    const g = getOwnedGroup(Number(c.req.param("id")), c.get("userId"));
    if (!g) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { command?: string; params?: Record<string, unknown> };
    if (!body.command || !FLEET_COMMANDS.has(body.command)) return c.json({ error: "unknown command" }, 400);
    const delivered = await emitGroupCommand(g.id, body.command, body.params);
    return c.json({ ok: true, delivered });
  });

  // Proof-of-play report for a group (JSON, or CSV with ?format=csv). ?days bounds the window.
  app.get("/api/groups/:id/play-log", (c) => {
    const g = getOwnedGroup(Number(c.req.param("id")), c.get("userId"));
    if (!g) return c.json({ error: "not found" }, 404);
    const days = Math.max(1, Math.min(365, Number(c.req.query("days")) || 7));
    const since = Date.now() - days * 86_400_000;
    const rows = playLogForGroup(g.id, since);
    if (c.req.query("format") === "csv") {
      return new Response(playLogCsv(rows), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="play-log-${g.id}.csv"` },
      });
    }
    return c.json({ days, rows });
  });

  // ---- setups ----

  app.get("/api/layouts", (c) => c.json(listSetups(c.get("orgId"), { archived: c.req.query("archived") === "1" }).map(setupSummary))); // #107 ?archived=1 → the archive view

  app.post("/api/layouts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; document?: unknown };
    const name = body.name?.trim() || "Untitled setup";
    let document;
    if (body.document !== undefined) {
      const parsed = safeParseDocument(body.document); // accepts v1 imports, stores v2
      if (!parsed.success) return c.json({ error: "validation", issues: parsed.issues }, 400);
      document = { ...parsed.data, name };
    } else {
      document = blankDocument(name, getUser(c.get("userId"))?.boardDefaults); // #155 — the user's new-board theme
    }
    const orgId = c.get("orgId");
    const firstBoard = listSetups(orgId).length === 0;
    const created = createLayout(name, document, { userId: c.get("userId"), orgId });
    track(firstBoard ? "first_board_created" : "board_created", { userId: c.get("userId"), orgId });
    return c.json(created, 201);
  });

  app.post("/api/layouts/preview-state", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { document?: unknown };
    const parsed = safeParseDocument(body.document);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.issues }, 400);
    const userId = c.get("userId");
    return c.json({ data: await resolveWidgetData(parsed.data, userId, connLookupForOrg(c.get("orgId"))) });
  });

  // Dry-run a binding so the Data tab can preview what a source returns. Works
  // for anonymous URLs and for the caller's own saved connections (secrets stay
  // server-side — the response carries only the resolved data).
  app.post("/api/source/preview", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
    const parsed = BlockSource.safeParse(body.source);
    if (!parsed.success) return c.json({ error: "validation" }, 400);
    return c.json({ data: await resolveSource(parsed.data, connLookupForOrg(c.get("orgId"))) });
  });

  // ---- integrations: provider catalog + the active org's connections ----

  app.get("/api/providers", (c) =>
    c.json([...PROVIDERS.values()].map((p) => ({
      id: p.id, label: p.label, category: p.category, authKind: p.authKind, oauth: !!p.oauth,
      resources: p.resources.map((r) => ({ id: r.id, label: r.label, shape: r.shape })),
    }))));

  app.get("/api/connections", (c) => c.json(listConnections(c.get("orgId"))));

  app.post("/api/connections", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { provider?: string; label?: string; config?: Record<string, unknown>; secret?: string };
    if (!body.provider) return c.json({ error: "provider required" }, 400);
    const created = createConnection(c.get("userId"), c.get("orgId"), { provider: body.provider, label: body.label, config: body.config, secret: body.secret });
    if (!created) return c.json({ error: "unknown provider" }, 400);
    return c.json(created, 201);
  });

  app.patch("/api/connections/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { label?: string; config?: Record<string, unknown>; secret?: string };
    const updated = updateConnection(c.req.param("id"), c.get("orgId"), body);
    if (!updated) return c.json({ error: "not found" }, 404);
    return c.json(updated);
  });

  app.delete("/api/connections/:id", (c) =>
    deleteConnection(c.req.param("id"), c.get("orgId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // Preview a resource of a saved connection (secrets never returned).
  app.post("/api/connections/:id/sample", async (c) => {
    const id = c.req.param("id");
    if (!getConnectionSummary(id, c.get("orgId"))) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
    const parsed = BlockSource.safeParse({ ...(body.source ?? {}), connectionId: id });
    if (!parsed.success) return c.json({ error: "validation" }, 400);
    return c.json({ data: await resolveSource(parsed.data, connLookupForOrg(c.get("orgId"))) });
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
    // Readable = owner OR a viewer/editor the board was shared with.
    const layout = getReadableLayout(Number(c.req.param("id")), c.get("userId"));
    if (!layout) return c.json({ error: "not found" }, 404);
    return c.json(layout);
  });

  app.put("/api/layouts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    // Writable = owner OR a shared editor.
    if (!getWritableLayout(id, c.get("userId"))) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { document?: unknown };
    const parsed = safeParseDocument(body.document);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.issues }, 400);
    const updated = updateLayout(id, parsed.data)!;
    await pushDevicesUsingLayout(id);
    return c.json({ id: updated.id, version: updated.version });
  });

  app.patch("/api/layouts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("orgId"))) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string; description?: string; published?: boolean; folder?: string | null; archived?: boolean;
    };
    if (body.archived !== undefined) setArchived(id, c.get("orgId"), body.archived); // #107 archive/restore
    const updated = updateLayoutMeta(id, body)!;
    return c.json(updated);
  });

  app.post("/api/layouts/:id/duplicate", (c) => {
    const copy = duplicateLayout(Number(c.req.param("id")), c.get("orgId"), c.get("userId"));
    if (!copy) return c.json({ error: "not found" }, 404);
    return c.json(copy, 201);
  });

  // ---- board version history (browse + restore past states) ----
  app.get("/api/layouts/:id/versions", (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("orgId"))) return c.json({ error: "not found" }, 404);
    return c.json(listLayoutVersions(id, c.get("orgId")));
  });

  app.post("/api/layouts/:id/versions/:vid/restore", async (c) => {
    const id = Number(c.req.param("id"));
    const orgId = c.get("orgId");
    if (!getOwnedLayout(id, orgId)) return c.json({ error: "not found" }, 404);
    const doc = getLayoutVersionDocument(id, Number(c.req.param("vid")), orgId);
    if (!doc) return c.json({ error: "version not found" }, 404);
    const updated = updateLayout(id, doc)!; // archives the pre-restore state too → restore is undoable
    await pushDevicesUsingLayout(id);
    return c.json({ id: updated.id, version: updated.version });
  });

  // #95 — name (or clear) a version. Labeled versions become permanent restore points.
  app.patch("/api/layouts/:id/versions/:vid", async (c) => {
    const id = Number(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { label?: string | null };
    if (!setVersionLabel(id, Number(c.req.param("vid")), c.get("orgId"), body.label ?? null)) {
      return c.json({ error: "version not found" }, 404);
    }
    return c.json({ ok: true });
  });

  app.delete("/api/layouts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("orgId"))) return c.json({ error: "not found" }, 404);
    const affected = deleteLayout(id);
    await pushDeviceIds(affected); // those screens fall back to "pick a setup"
    return c.json({ ok: true });
  });

  // ---- public read-only share links ----
  // The shareable link points at the /s/:token landing (server-rendered OG meta so
  // it unfurls), which instantly redirects humans to the /screen viewer.
  const shareLink = (c: Context, token: string) => `${publicBase(c)}/s/${token}`;

  const shareResponse = (c: Context, info: ReturnType<typeof getShareInfo>) =>
    info ? { token: info.token, url: shareLink(c, info.token), expiresAt: info.expiresAt, hasPassword: info.hasPassword } : { token: null };

  app.get("/api/layouts/:id/share", (c) => c.json(shareResponse(c, getShareInfo(Number(c.req.param("id")), c.get("orgId")))));

  app.post("/api/layouts/:id/share", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { expiresInDays?: number | null; password?: string | null };
    const opts: { expiresAt?: number | null; password?: string | null } = {};
    if (body.expiresInDays !== undefined) opts.expiresAt = body.expiresInDays && body.expiresInDays > 0 ? Date.now() + body.expiresInDays * 86_400_000 : null;
    if (body.password !== undefined) opts.password = body.password ? body.password : null;
    const info = setShareToken(Number(c.req.param("id")), c.get("orgId"), opts);
    if (!info) return c.json({ error: "not found" }, 404);
    return c.json(shareResponse(c, info));
  });

  app.delete("/api/layouts/:id/share", (c) => {
    clearShareToken(Number(c.req.param("id")), c.get("orgId"));
    return c.json({ ok: true });
  });

  // ---- user-to-user sharing (board/screen → another account, viewer|editor) ----
  app.get("/api/shares", (c) => c.json(listSharesByOwner(c.get("userId"))));

  app.post("/api/shares", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { kind?: "layout" | "device"; targetId?: string; email?: string; access?: "viewer" | "editor" };
    if ((body.kind !== "layout" && body.kind !== "device") || !body.targetId || !body.email || (body.access !== "viewer" && body.access !== "editor")) {
      return c.json({ error: "kind, targetId, email and access are required" }, 400);
    }
    const r = createShare(c.get("userId"), body.kind, body.targetId, body.email, body.access);
    if (!r.ok) {
      const status = r.error === "no_user" ? 404 : r.error === "self" ? 400 : 403;
      return c.json({ error: r.error === "no_user" ? "no account with that email" : r.error === "self" ? "you can't share with yourself" : "you don't own that item" }, status);
    }
    return c.json(r.share, 201);
  });

  app.patch("/api/shares/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { access?: "viewer" | "editor" };
    if (body.access !== "viewer" && body.access !== "editor") return c.json({ error: "access required" }, 400);
    return updateShareAccess(c.req.param("id"), c.get("userId"), body.access)
      ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/shares/:id", (c) =>
    revokeShare(c.req.param("id"), c.get("userId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // Boards shared WITH the caller (a lean summary + access + owner label).
  app.get("/api/shared/layouts", (c) =>
    c.json(sharedLayouts(c.get("userId")).map(({ layout, access, ownerName }) => ({
      id: layout.id,
      name: layout.name,
      access,
      ownerName,
      widgetCount: layout.document.rows.reduce((n, r) => n + r.blocks.length, 0),
    }))));

  // Public board state (no auth) — honors expiry + optional password, then
  // resolves live data under the OWNER's connections. A protected board is
  // unlocked via POST .../unlock (password in the body, never the URL), which
  // sets a short-lived signed cookie the polling GETs present — so the password
  // never lands in logs / history / referrers.
  const shareCookie = (token: string) => `glanceos_share_${token.slice(0, 12)}`;
  const shareUnlockSig = (token: string) => hmacSign(`share-unlock:${token}`);

  app.post("/api/public/board/:token/unlock", async (c) => {
    const token = c.req.param("token");
    const found = getLayoutByShareToken(token);
    if (!found || shareExpired(found.expiresAt)) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (!verifySharePassword(found.pwHash, body.password)) return c.json({ error: "password_required" }, 401);
    setCookie(c, shareCookie(token), shareUnlockSig(token), { httpOnly: true, secure: SECURE_COOKIES, sameSite: "Lax", path: "/", maxAge: 12 * 60 * 60 });
    return c.json({ ok: true });
  });

  app.get("/api/public/board/:token", async (c) => {
    const token = c.req.param("token");
    const found = getLayoutByShareToken(token);
    if (!found || shareExpired(found.expiresAt)) return c.json({ error: "not found" }, 404);
    if (found.pwHash) {
      const cookie = getCookie(c, shareCookie(token));
      if (!cookie || !hmacVerify(`share-unlock:${token}`, cookie)) return c.json({ error: "password_required" }, 401);
    }
    const { record, ownerId } = found;
    const data = await resolveWidgetData(record.document, ownerId ?? "", record.orgId ? connLookupForOrg(record.orgId) : undefined, undefined, undefined, true, true); // #156 — public view: private data omitted
    return c.json({ claimed: true, state: { layoutVersion: record.version, layout: record.document, data, deviceName: record.name } });
  });

  // A monochrome, dithered snapshot of a shared board — the social-unfurl image for
  // /s/:token. Reuses the device Chromium+dither pipeline. Password-protected boards
  // 404 unless the caller holds the unlock cookie (so a crawler never leaks content).
  app.get("/api/public/board/:token/preview.png", async (c) => {
    const token = c.req.param("token");
    const found = getLayoutByShareToken(token);
    if (!found || shareExpired(found.expiresAt)) return c.json({ error: "not found" }, 404);
    if (found.pwHash) {
      const cookie = getCookie(c, shareCookie(token));
      if (!cookie || !hmacVerify(`share-unlock:${token}`, cookie)) return c.json({ error: "not found" }, 404);
    }
    if (!(await renderAvailable())) return c.json({ error: "render support not installed" }, 503);
    const { record, ownerId } = found;
    const data = await resolveWidgetData(record.document, ownerId ?? "", record.orgId ? connLookupForOrg(record.orgId) : undefined, undefined, undefined, true, true); // #156 — public view: private data omitted
    const payload = { claimed: true, state: { layoutVersion: record.version, layout: record.document, data, deviceName: record.name } } as unknown as Parameters<typeof renderImage>[1];
    try {
      const { buf, contentType } = await renderImage(baseUrl(), payload, 1200, 630, "png", `pub:${token}:${record.version}`);
      // A protected board's snapshot is gated by the unlock cookie — keep it out of shared
      // (proxy/CDN) caches that could replay it to a client without the cookie. Only an
      // unprotected board's image is safe to mark `public`.
      const cache = found.pwHash ? "private, max-age=300" : "public, max-age=300";
      return new Response(Uint8Array.from(buf), { status: 200, headers: { "content-type": contentType, "cache-control": cache } });
    } catch (e) {
      return serverError(c, e);
    }
  });

  // Human-friendly share landing: server-rendered per-token OpenGraph meta (so the
  // link unfurls with the board's preview image) + an instant redirect to the viewer.
  app.get("/s/:token", (c) => {
    const token = c.req.param("token");
    const found = getLayoutByShareToken(token);
    const origin = publicBase(c);
    const viewer = `${origin}/screen/?share=${encodeURIComponent(token)}`;
    if (!found || shareExpired(found.expiresAt)) {
      return c.html(`<!doctype html><meta charset="utf-8"><title>GlanceOS</title><p>This shared board link is no longer available.</p>`, 404);
    }
    const locked = !!found.pwHash;
    const title = locked ? "Protected board · GlanceOS" : `${escapeHtml(found.record.name || "Untitled board")} · GlanceOS`;
    const img = locked ? "" : `${origin}/api/public/board/${encodeURIComponent(token)}/preview.png`;
    const og = img
      ? `<meta property="og:image" content="${img}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}">`
      : `<meta name="twitter:card" content="summary">`;
    return c.html(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="A live board shared from GlanceOS — a calm, glanceable dashboard for any screen.">
${og}
<meta http-equiv="refresh" content="0; url=${escapeHtml(viewer)}">
<link rel="canonical" href="${escapeHtml(viewer)}">
</head><body style="font:16px/1.5 system-ui,sans-serif;color:#444;margin:3rem auto;max-width:32rem;padding:0 1rem">
<p>Opening <strong>${title}</strong>… <a href="${escapeHtml(viewer)}">Continue</a> if you're not redirected.</p>
<script>location.replace(${JSON.stringify(viewer)});</script>
</body></html>`);
  });

  // ---- template hub ----

  app.get("/api/hub", (c) => c.json(listPublished(c.req.query("q"))));

  app.post("/api/hub/:id/import", async (c) => {
    const copy = importFromHub(Number(c.req.param("id")), c.get("userId"), c.get("orgId"));
    if (!copy) return c.json({ error: "not found" }, 404);
    return c.json(copy, 201);
  });

  // Submit one of your own boards to the template gallery — pending admin review.
  app.post("/api/layouts/:id/publish", async (c) => {
    const id = Number(c.req.param("id"));
    if (!getOwnedLayout(id, c.get("orgId"))) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { description?: string };
    const rec = publishForReview(id, (body.description ?? "").slice(0, 280));
    return rec ? c.json(rec) : c.json({ error: "not found" }, 404);
  });

  // ---- template moderation (admin only) ----
  app.get("/api/templates/pending", (c) => {
    if (!isUserAdmin(c.get("userId"))) return c.json({ error: "forbidden" }, 403);
    return c.json(listPendingTemplates());
  });
  app.post("/api/templates/:id/review", async (c) => {
    if (!isUserAdmin(c.get("userId"))) return c.json({ error: "forbidden" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { approved?: boolean };
    const rec = setReviewStatus(Number(c.req.param("id")), body.approved === true);
    return rec ? c.json(rec) : c.json({ error: "not found" }, 404);
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

  // ---- custom data (per-user key→JSON; read by the "customData" block) ----
  // GET stays session-only; POST is also reachable with a data:write API key
  // (allowlisted) so scripts / webhooks / automations can push values.
  app.get("/api/data", (c) => c.json(listCustomData(c.get("userId"))));
  app.get("/api/data/:key", (c) => {
    const value = getCustomData(c.get("userId"), c.req.param("key"));
    return value === undefined ? c.json({ error: "not found" }, 404) : c.json({ key: c.req.param("key"), value });
  });
  // #156 — mark a data key private (renders only on your own screens; never on public shares).
  app.post("/api/data/:key/privacy", async (c) => {
    const { private: priv } = (await c.req.json().catch(() => ({}))) as { private?: boolean };
    if (!setDataPrivacy(c.get("userId"), c.req.param("key"), priv === true)) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, private: priv === true });
  });
  // #27 — the recorded history of a numeric data key (last N days, default 30) for charting.
  app.get("/api/data/:key/history", (c) => {
    const days = Math.min(365, Math.max(1, Number(c.req.query("days")) || 30));
    return c.json({ key: c.req.param("key"), points: metricSeries(c.get("userId"), c.req.param("key"), Date.now() - days * 86_400_000) });
  });
  app.post("/api/data/:key", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { value?: unknown };
    if (!("value" in body)) return c.json({ error: "body must include a \"value\"" }, 400);
    const r = setCustomData(c.get("userId"), c.req.param("key"), body.value);
    if (!r.ok) {
      const status = r.error === "too_large" ? 413 : r.error === "too_many_keys" ? 409 : 400;
      return c.json({ error: r.error }, status);
    }
    await pushUserDevices(c.get("userId"));
    return c.json(r.entry, 201);
  });
  app.delete("/api/data/:key", (c) =>
    deleteCustomData(c.get("userId"), c.req.param("key")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // #153 — reflection journal: the day's prompt + entry, and recent entries. `day` is the client's
  // local date (YYYY-MM-DD); server date is the fallback.
  const journalDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10));
  app.get("/api/journal", (c) => {
    const day = journalDay(c.req.query("day"));
    return c.json({ day, prompt: promptForDay(day), entry: getJournal(c.get("userId"), day), recent: recentJournal(c.get("userId"), 30) });
  });
  app.put("/api/journal", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { day?: string; text?: string };
    setJournal(c.get("userId"), journalDay(body.day), typeof body.text === "string" ? body.text : "");
    await pushUserDevices(c.get("userId")); // a journal block on a screen reflects the new entry
    return c.json({ ok: true });
  });

  // ---- #3 scenes: named snapshots of your custom-data, applied in one tap ----
  app.get("/api/scenes", (c) => c.json(listScenes(c.get("userId"))));
  app.post("/api/scenes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const s = captureScene(c.get("userId"), c.get("orgId"), body.name ?? "");
    return s ? c.json(s, 201) : c.json({ error: "name required" }, 400);
  });
  app.post("/api/scenes/:id/apply", async (c) => {
    const n = applyScene(Number(c.req.param("id")), c.get("userId"));
    if (n < 0) return c.json({ error: "not found" }, 404);
    await pushUserDevices(c.get("userId")); // flip every screen of theirs to the scene's values
    return c.json({ ok: true, applied: n });
  });
  app.patch("/api/scenes/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    return renameScene(Number(c.req.param("id")), c.get("userId"), body.name ?? "")
      ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/scenes/:id", (c) =>
    deleteScene(Number(c.req.param("id")), c.get("userId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // ---- webhook inlets (management is session-only) ----
  app.get("/api/inlets", (c) => c.json(listInlets(c.get("userId"))));
  app.post("/api/inlets", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; sinkKind?: string; sinkTarget?: string; requireSignature?: boolean };
    if (!body.sinkKind || !isSinkKind(body.sinkKind)) return c.json({ error: "sinkKind must be one of task|queue|data|none" }, 400);
    const { inlet, signingKey } = createInlet(c.get("userId"), {
      name: body.name ?? "Inlet", sinkKind: body.sinkKind, sinkTarget: body.sinkTarget, requireSignature: !!body.requireSignature,
    });
    const url = `${new URL(c.req.url).origin}/api/hooks/${inlet.secret}`;
    return c.json({ inlet, url, signingKey, example: { text: "Hello from a webhook" } }, 201); // signingKey shown once
  });
  app.patch("/api/inlets/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; sinkKind?: string; sinkTarget?: string; enabled?: boolean };
    if (body.sinkKind !== undefined && !isSinkKind(body.sinkKind)) return c.json({ error: "bad sinkKind" }, 400);
    const updated = updateInlet(c.req.param("id"), c.get("userId"), { ...body, sinkKind: body.sinkKind as SinkKind | undefined });
    return updated ? c.json(updated) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/inlets/:id", (c) =>
    deleteInlet(c.req.param("id"), c.get("userId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // The public inbound webhook — pre-guard skip-listed (no session/CSRF); the URL
  // secret is the capability, plus an optional HMAC over the raw body.
  app.post("/api/hooks/:secret", async (c) => {
    const raw = await c.req.text();
    const inlet = resolveInlet(c.req.param("secret"));
    if (!inlet || !inlet.enabled) return c.json({ error: "unknown inlet" }, 404);
    if (!verifyInletSignature(inlet, raw, c.req.header("x-signature") ?? c.req.header("x-hub-signature-256"))) {
      return c.json({ error: "bad signature" }, 401);
    }
    let payload: Record<string, unknown> = {};
    try { const p = JSON.parse(raw || "{}"); if (p && typeof p === "object") payload = p as Record<string, unknown>; } catch { /* non-JSON → empty */ }
    // Don't re-fire automations if this hook was itself produced by an automation's webhook action.
    const fromAutomation = c.req.header("x-glanceos-automation") === "1";
    return c.json({ ok: true, ...(await routeInlet(inlet, payload, { fireAutos: !fromAutomation })) });
  });

  // ---- automations (session-only; not in API_ALLOW so keys can't manage them) ----
  // Bound nesting BEFORE zod parses (z.lazy on the recursive Condition would
  // otherwise blow the stack on a pathologically deep payload).
  const tooDeep = (v: unknown, d = 0): boolean => {
    if (d > 40) return true;
    if (Array.isArray(v)) return v.some((x) => tooDeep(x, d + 1));
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some((x) => tooDeep(x, d + 1));
    return false;
  };
  // Optional board scope on an automation request: a valid owned layout id, null for
  // a global rule, or false when the caller can't access the referenced board.
  const boardScope = (body: unknown, orgId: string): number | null | false => {
    const raw = (body as { layoutId?: unknown } | null)?.layoutId;
    if (raw == null) return null;
    if (!Number.isInteger(raw)) return false;
    return getOwnedLayout(raw as number, orgId) ? (raw as number) : false;
  };
  app.get("/api/automations", (c) => c.json(listAutomations(c.get("userId"))));
  app.post("/api/automations", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (tooDeep(body)) return c.json({ error: "automation is nested too deeply" }, 400);
    const parsed = Automation.safeParse(body);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.issues }, 400);
    const layoutId = boardScope(body, c.get("orgId"));
    if (layoutId === false) return c.json({ error: "no access to that board" }, 400);
    if (countAutomations(c.get("userId")) >= MAX_AUTOMATIONS_PER_USER) return c.json({ error: `at most ${MAX_AUTOMATIONS_PER_USER} automations` }, 409);
    return c.json(createAutomation(c.get("userId"), parsed.data, layoutId), 201);
  });
  app.post("/api/automations/test", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (tooDeep(body)) return c.json({ error: "automation is nested too deeply" }, 400);
    const parsed = Automation.safeParse(body);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.issues }, 400);
    const layoutId = boardScope(body, c.get("orgId"));
    if (layoutId === false) return c.json({ error: "no access to that board" }, 400);
    return c.json(dryRunAutomation(parsed.data, c.get("userId"), layoutId)); // no side effects
  });
  app.get("/api/automations/:id/runs", (c) =>
    getAutomation(c.req.param("id"), c.get("userId")) ? c.json(listRuns(c.req.param("id"), c.get("userId"))) : c.json({ error: "not found" }, 404));
  app.post("/api/automations/:id/run-now", async (c) => {
    try { return c.json(await runAutomationById(c.req.param("id"), c.get("userId"))); }
    catch (e) { return c.json({ error: e instanceof Error ? e.message : "failed" }, 404); }
  });
  // #14 — mute a noisy rule for N minutes (minutes <= 0 clears the snooze). Capped at 7 days.
  app.post("/api/automations/:id/snooze", async (c) => {
    const { minutes } = (await c.req.json().catch(() => ({}))) as { minutes?: number };
    const until = minutes && minutes > 0 ? Date.now() + Math.min(minutes, 10080) * 60_000 : null;
    if (!snoozeAutomation(c.req.param("id"), c.get("userId"), until)) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, snoozedUntil: until });
  });
  app.patch("/api/automations/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    // a bare {enabled} toggle from the list (exactly that one key), else a full update
    if (body && typeof body === "object" && Object.keys(body).length === 1 && typeof (body as { enabled?: unknown }).enabled === "boolean") {
      return setAutomationEnabled(c.req.param("id"), c.get("userId"), (body as { enabled: boolean }).enabled)
        ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
    }
    if (tooDeep(body)) return c.json({ error: "automation is nested too deeply" }, 400);
    const parsed = Automation.safeParse(body);
    if (!parsed.success) return c.json({ error: "validation", issues: parsed.error.issues }, 400);
    const layoutId = boardScope(body, c.get("orgId"));
    if (layoutId === false) return c.json({ error: "no access to that board" }, 400);
    const updated = updateAutomation(c.req.param("id"), c.get("userId"), parsed.data, layoutId);
    return updated ? c.json(updated) : c.json({ error: "not found" }, 404);
  });
  app.delete("/api/automations/:id", (c) =>
    deleteAutomation(c.req.param("id"), c.get("userId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));

  // ---- organizations (teams) ----
  // Authorize an org-management action against the org named in the PATH (not the active
  // org): returns the actor's role in that org if it meets `min`, else null (→ caller 403).
  const orgRole = (c: Context<Env>, orgId: string, min: Role): Role | null => {
    const role = memberRole(orgId, c.get("userId"));
    return role && ROLE_RANK[role] >= ROLE_RANK[min] ? role : null;
  };

  app.get("/api/orgs", (c) => c.json(listOrgsForUser(c.get("userId"))));

  app.post("/api/orgs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    const name = (body.name ?? "").toString().trim();
    if (!name) return c.json({ error: "name required" }, 400);
    const org = createOrg(name, c.get("userId"));
    setSessionActiveOrg(getCookie(c, SESSION_COOKIE), org.id); // switch into the new team
    track("org_created", { userId: c.get("userId"), orgId: org.id });
    return c.json({ id: org.id, name: org.name, slug: org.slug, personal: false, role: "owner", plan: org.plan }, 201);
  });

  app.post("/api/orgs/switch", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string };
    const orgId = (body.orgId ?? "").toString();
    if (!memberRole(orgId, c.get("userId"))) return c.json({ error: "no access to that workspace" }, 403);
    setSessionActiveOrg(getCookie(c, SESSION_COOKIE), orgId);
    return c.json({ ok: true, orgId });
  });

  app.patch("/api/orgs/:id", async (c) => {
    const id = c.req.param("id");
    if (!orgRole(c, id, "admin")) return c.json({ error: "forbidden" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    return renameOrg(id, (body.name ?? "").toString()) ? c.json({ ok: true }) : c.json({ error: "can't rename" }, 400);
  });

  app.delete("/api/orgs/:id", (c) => {
    const id = c.req.param("id");
    if (!orgRole(c, id, "owner")) return c.json({ error: "forbidden" }, 403);
    return deleteOrg(id) ? c.json({ ok: true }) : c.json({ error: "can't delete (personal org?)" }, 400);
  });

  app.get("/api/orgs/:id/members", (c) => {
    const id = c.req.param("id");
    if (!memberRole(id, c.get("userId"))) return c.json({ error: "forbidden" }, 403);
    return c.json({ members: listMembers(id), invites: orgRole(c, id, "admin") ? listInvites(id) : [] });
  });

  app.post("/api/orgs/:id/invites", async (c) => {
    const id = c.req.param("id");
    if (!orgRole(c, id, "admin")) return c.json({ error: "forbidden" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
    const email = (body.email ?? "").toString().trim();
    const role = (body.role ?? "editor").toString();
    if (!email || !email.includes("@")) return c.json({ error: "a valid email is required" }, 400);
    if (!isRole(role)) return c.json({ error: "bad role" }, 400);
    const r = createInvite(id, email, role, c.get("userId"));
    if (!r.ok) return c.json({ error: r.error }, 409);
    track("member_invited", { userId: c.get("userId"), orgId: id, props: { role } });
    void sendInviteEmail(email, getOrg(id)?.name ?? "a team", getUser(c.get("userId"))?.name ?? null, role, r.token);
    return c.json({ ok: true, token: r.token, link: publicUrl(`/#/invite/${r.token}`) }, 201);
  });

  app.delete("/api/orgs/:id/invites/:token", (c) => {
    const id = c.req.param("id");
    if (!orgRole(c, id, "admin")) return c.json({ error: "forbidden" }, 403);
    return revokeInvite(id, c.req.param("token")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  app.patch("/api/orgs/:id/members/:userId", async (c) => {
    const id = c.req.param("id");
    if (!orgRole(c, id, "admin")) return c.json({ error: "forbidden" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { role?: string };
    const role = (body.role ?? "").toString();
    if (!isRole(role)) return c.json({ error: "bad role" }, 400);
    const r = changeRole(id, c.req.param("userId"), role);
    return r === "ok" ? c.json({ ok: true }) : c.json({ error: r }, r === "last_owner" ? 409 : 404);
  });

  app.delete("/api/orgs/:id/members/:userId", (c) => {
    const id = c.req.param("id");
    const target = c.req.param("userId");
    // A member can always remove THEMSELVES (leave); removing others needs admin.
    if (target !== c.get("userId") && !orgRole(c, id, "admin")) return c.json({ error: "forbidden" }, 403);
    const r = removeMember(id, target);
    return r === "ok" ? c.json({ ok: true }) : c.json({ error: r }, r === "last_owner" ? 409 : 404);
  });

  // Invite acceptance (the actor is whoever is logged in; the token is the bearer secret).
  app.get("/api/invites/:token", (c) => {
    const preview = getInvite(c.req.param("token"));
    return preview ? c.json(preview) : c.json({ error: "invite is invalid or expired" }, 404);
  });
  app.post("/api/invites/:token/accept", (c) => {
    const r = acceptInvite(c.req.param("token"), c.get("userId"));
    if (!r.ok) return c.json({ error: "invite is invalid or expired" }, 404);
    setSessionActiveOrg(getCookie(c, SESSION_COOKIE), r.orgId); // drop the new member into the team
    track("invite_accepted", { userId: c.get("userId"), orgId: r.orgId });
    return c.json({ ok: true, orgId: r.orgId });
  });

  // ---- billing (per-screen; the active org is the billing entity) ----
  app.get("/api/billing/summary", (c) => {
    const s = billingSummary(c.get("orgId"));
    return s ? c.json({ ...s, stripeConfigured: stripeConfigured() }) : c.json({ error: "no active workspace" }, 404);
  });

  // Start a per-screen subscription checkout (owner only). 503 when Stripe isn't set up.
  app.post("/api/billing/checkout", async (c) => {
    if (c.get("role") !== "owner") return c.json({ error: "only the workspace owner can manage billing" }, 403);
    if (!stripeConfigured()) return c.json({ error: "billing is not configured on this server" }, 503);
    const body = (await c.req.json().catch(() => ({}))) as { screens?: number };
    const screens = Math.max(1, Math.floor(Number(body.screens) || 1));
    const url = await createCheckout(c.get("orgId"), screens, {
      email: getUser(c.get("userId"))?.email,
      successUrl: publicUrl("/#/members?upgraded=1"),
      cancelUrl: publicUrl("/#/members"),
    });
    return url ? c.json({ url }) : c.json({ error: "couldn't start checkout" }, 502);
  });

  // Open the Stripe customer portal (owner only) to change quantity / cancel.
  app.post("/api/billing/portal", async (c) => {
    if (c.get("role") !== "owner") return c.json({ error: "only the workspace owner can manage billing" }, 403);
    const url = await createPortal(c.get("orgId"), publicUrl("/#/members"));
    return url ? c.json({ url }) : c.json({ error: "no billing account yet" }, 400);
  });

  // Stripe webhook (under /api/hooks/* → bypasses session auth + CSRF). Verifies the
  // signature over the RAW body, then syncs the subscription state onto the org.
  app.post("/api/hooks/stripe", async (c) => {
    const raw = await c.req.text();
    return handleWebhook(raw, c.req.header("stripe-signature")) ? c.json({ received: true }) : c.json({ error: "bad signature" }, 400);
  });

  // ---- onboarding + founder metrics ----
  app.post("/api/account/onboarded", (c) => { markOnboarded(c.get("userId")); return c.json({ ok: true }); });

  // Activation funnel + active users + cohort retention, for the instance owner only.
  app.get("/api/admin/metrics", (c) => {
    if (!isUserAdmin(c.get("userId"))) return c.json({ error: "forbidden" }, 403);
    const DAY = 86_400_000;
    const since = Number(c.req.query("sinceDays")) > 0 ? Date.now() - Number(c.req.query("sinceDays")) * DAY : 0;
    const funnel = funnelCounts(["signup", "first_board_created", "screen_claimed", "activated"], since);
    // D1/D7 retention for the cohort that signed up ~8 days ago (a fully-observable window).
    const cohortDay = Math.floor((Date.now() - 8 * DAY) / DAY) * DAY;
    return c.json({ funnel, active: dauWau(), retention: retentionD1D7(cohortDay) });
  });

  // ---- account management ----
  app.patch("/api/account", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; defaultTimezone?: string | null; home?: { name: string; latitude: number; longitude: number } | null; homeLayoutId?: number | null; boardDefaults?: unknown };
    const userId = c.get("userId");
    let u = getUser(userId);
    if (typeof body.name === "string") {
      if (!body.name.trim()) return c.json({ error: "name required" }, 400);
      u = updateUserName(userId, body.name) ?? u;
    }
    if (body.defaultTimezone !== undefined) {
      u = updateUserTimezone(userId, body.defaultTimezone);
      if (!u) return c.json({ error: "invalid timezone" }, 400);
    }
    if (body.home !== undefined) {
      // null clears the home; an object sets it (coordinates bounded server-side).
      const home = body.home === null ? null : { name: String(body.home.name ?? ""), latitude: Number(body.home.latitude), longitude: Number(body.home.longitude) };
      u = setUserHome(userId, home);
      if (!u) return c.json({ error: "invalid location" }, 400);
    }
    if (body.homeLayoutId !== undefined) {
      // #147 — null clears the home board; a number must be a board in THIS org (no cross-org
      // exposure). currentLayoutId re-checks org ownership at resolve time as a second guard.
      if (body.homeLayoutId !== null && !getOwnedLayout(body.homeLayoutId, c.get("orgId"))) {
        return c.json({ error: "board not found" }, 400);
      }
      u = setUserHomeLayout(userId, body.homeLayoutId);
      await pushUserDevices(userId); // unassigned screens pick up the new (or cleared) home live
    }
    if (body.boardDefaults !== undefined) {
      u = setUserBoardDefaults(userId, body.boardDefaults); // #155 — sanitized; null/{} clears
    }
    return u ? c.json(u) : c.json({ error: "not found" }, 404);
  });
  // City search → coordinates (+ timezone) for the location pickers (SSRF-guarded).
  app.get("/api/geocode", async (c) => c.json(await geocodeSearch(c.req.query("q") ?? "").catch(() => [])));
  // Coordinates → a human place name, for a one-time browser geolocation (SSRF-guarded).
  app.get("/api/reverse-geocode", async (c) => {
    const lat = Number(c.req.query("lat")), lon = Number(c.req.query("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return c.json({ error: "lat & lon required" }, 400);
    return c.json((await reverseGeocode(lat, lon).catch(() => null)) ?? { name: "My location" });
  });
  // The canonical IANA zone list (matches the server's own validation) for the
  // timezone <select>s. Static + cacheable.
  app.get("/api/timezones", (c) => {
    c.header("cache-control", "public, max-age=86400");
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return c.json(zones.includes("UTC") ? zones : ["UTC", ...zones]);
  });

  app.post("/api/account/password", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { current?: string; next?: string };
    if (!body.next || body.next.length < 8) return c.json({ error: "new password must be at least 8 characters" }, 400);
    if (!changePassword(c.get("userId"), body.current ?? "", body.next)) return c.json({ error: "current password is incorrect" }, 400);
    return c.json({ ok: true });
  });
  app.post("/api/account/logout-everywhere", (c) => {
    destroyAllSessions(c.get("userId"));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // #167 — privacy dashboard: a transparent count of what's stored about you, plus which
  // apps you've connected (label + status only — secrets are never read here). Pairs with
  // the existing full-backup export and account-delete below it.
  app.get("/api/account/data-summary", (c) => {
    const userId = c.get("userId"), orgId = c.get("orgId");
    return c.json({
      boards: listSetups(orgId).length,
      screens: devicesOwnedBy(userId).length,
      automations: countAutomations(userId),
      customDataKeys: listCustomData(userId).length,
      tasks: listTasks(userId, "default").length,
      inlets: listInlets(userId).length,
      apiKeys: listKeys(userId).length,
      connections: listConnections(orgId).map((x) => ({ provider: x.provider, label: x.label, status: x.status })),
    });
  });

  // ---- API keys (session-only: you can't manage keys with a key — these routes
  // are absent from API_ALLOW, so a Bearer principal gets 403 before reaching here) ----
  app.get("/api/account/api-keys", (c) => c.json(listKeys(c.get("userId"))));
  app.post("/api/account/api-keys", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; scopes?: unknown };
    const name = (body.name ?? "").toString();
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s): s is string => typeof s === "string").filter(isScope) : [];
    if (!name.trim()) return c.json({ error: "name is required" }, 400);
    if (scopes.length === 0) return c.json({ error: "pick at least one scope", validScopes: SCOPES }, 400);
    const { token, key } = mintKey(c.get("userId"), c.get("orgId"), name, scopes as Scope[]);
    return c.json({ token, key }, 201); // token is shown ONCE — never recoverable
  });
  app.delete("/api/account/api-keys/:id", (c) =>
    revokeKey(c.req.param("id"), c.get("userId")) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404));
  app.delete("/api/account", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { password?: string };
    if (!deleteUser(c.get("userId"), body.password ?? "")) return c.json({ error: "password is incorrect" }, 401);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
  app.get("/api/account/export", (c) => {
    c.header("content-disposition", 'attachment; filename="glanceos-backup.json"');
    return c.json(dumpUser(c.get("userId"), c.get("orgId")));
  });
  app.post("/api/account/import", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { dump?: unknown; mode?: string } | null;
    if (!body || typeof body.dump !== "object") return c.json({ error: "missing backup data" }, 400);
    const mode = body.mode === "replace" ? "replace" : "append";
    try {
      return c.json({ ok: true, mode, ...importUser(c.get("userId"), c.get("orgId"), body.dump, { mode }) });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "import failed" }, 400);
    }
  });

  // ---- user image uploads ----
  app.post("/api/uploads", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = (body as Record<string, unknown>).file;
    if (!(file instanceof File)) return c.json({ error: "no file" }, 400);
    if (!isAllowedMime(file.type)) return c.json({ error: "unsupported type — use PNG, JPEG, WebP or GIF" }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_UPLOAD_BYTES) return c.json({ error: "image too large (max 2 MB)" }, 413);
    if (userUsage(userId) + buf.length > UPLOAD_QUOTA_BYTES) {
      return c.json({ error: `upload quota reached (${Math.round(UPLOAD_QUOTA_BYTES / (1024 * 1024))} MB) — delete some images first` }, 413);
    }
    return c.json(saveUpload(userId, buf, file.type, file.name), 201);
  });
  // Serve uploaded bytes (unguessable id; referenced by image blocks + public boards).
  app.use("/uploads/*", serveStatic({ root: relative(process.cwd(), join(dataDir, "uploads")), rewriteRequestPath: (p) => p.replace(/^\/uploads/, "") || "/" }));

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
    // SPA fallback for the config app. When GLANCEOS_PUBLIC_URL is set we serve the
    // shell with ABSOLUTE og:url/og:image so strict social scrapers unfurl the card
    // (relative `/og.png` resolves against the page origin for most, not all). The
    // dist is immutable post-build, so read + transform once at boot; fall back to
    // static serving if the read fails.
    const indexHtmlPath = join(root, "index.html");
    const publicUrl = process.env.GLANCEOS_PUBLIC_URL?.replace(/\/+$/, "") ?? "";
    let shellHtml = "";
    try {
      shellHtml = readFileSync(indexHtmlPath, "utf8");
      if (publicUrl) shellHtml = injectAbsoluteOg(shellHtml, publicUrl);
    } catch { shellHtml = ""; }
    if (shellHtml) app.get("*", (c) => c.html(shellHtml));
    else app.get("*", serveStatic({ path: indexHtmlPath }));
  }

  return app;
}
