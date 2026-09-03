import type { LayoutT } from "@glanceos/schema";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  defaultTimezone: string | null;
  homeLocationName: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  homeLayoutId: number | null;
  boardDefaults: { mode?: "light" | "dark" | "auto"; fontScale?: "s" | "m" | "l"; look?: string } | null; // #155
  dailyBriefAt: number | null; // #42 — minute of local day the emailed daily brief goes out; null = off
  alertDigestMin: number | null; // #47 — alert digest window in minutes; null = off
  isAdmin: boolean;
  onboardedAt: number | null;
  activatedAt: number | null;
}

export type OrgRole = "owner" | "admin" | "editor" | "viewer";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  personal: boolean;
  role: OrgRole;
  plan: string;
}

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  createdAt: number;
}

export interface OrgInvite {
  token: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
  expiresAt: number;
  createdAt: number;
}

export interface BillingSummary {
  plan: string;
  status: string;
  screensUsed: number;
  screenLimit: number;
  freeScreens: number;
  screensPaid: number;
  canAddScreen: boolean;
  periodEnd: number | null;
  managed: boolean;
}

export interface AuthStatus {
  authed: boolean;
  user: UserInfo | null;
  registrationOpen: boolean;
  emailReady?: boolean; // #42 — whether the server has a mail backend (briefs/invites actually send)
  activeOrg: { id: string; name: string; slug: string; personal: boolean; plan: string } | null;
  role: OrgRole | null;
  orgs: OrgSummary[];
}

/** Role capability helper, mirrored from the server's ROLE_RANK. */
export const ROLE_RANK: Record<OrgRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const canEdit = (r: OrgRole | null | undefined): boolean => !!r && ROLE_RANK[r] >= ROLE_RANK.editor;
export const canManageTeam = (r: OrgRole | null | undefined): boolean => !!r && ROLE_RANK[r] >= ROLE_RANK.admin;

export interface DeviceSummary {
  id: string;
  name: string | null;
  claimed: boolean;
  layoutId: number | null;
  layoutName: string | null;
  online: boolean;
  // Honest health across both device classes: a poll-based e-ink panel never holds an
  // SSE stream, so `online` alone calls every healthy one offline. Prefer `health`.
  health?: "live" | "recent" | "stale" | "offline";
  refreshSeconds: number;
  battery: number | null;
  batteryForecast?: { battery: number; daysRemaining: number | null; basis: "ok" | "charging" | "collecting" } | null;
  rssi: number | null;
  firmware: string | null;
  lastSeen: number | null;
  resolution: string;
  timezone: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  renderOpts: { algo?: string; threshold?: number; gamma?: number };
  tv: {
    tvMode: boolean;
    safeArea?: { top: number; right: number; bottom: number; left: number };
    burnIn?: { pixelShift: boolean; dim: boolean; screensaverAfterMin: number };
    wake?: { startMin: number; endMin: number; daysMask: number };
    quietHours?: { startMin: number; endMin: number; daysMask: number };
  };
  lowBattery?: { layoutId: number; pct: number } | null;
  lowBatteryName?: string | null;
  platform: string | null;
  nativeVersion: string | null;
  groupId: number | null;
  groupName: string | null;
  createdAt: number;
}

export interface DisplayGroup {
  id: number;
  name: string;
  timezone: string | null;
  layoutId: number | null;
  deviceCount: number;
}

export interface SetupSummary {
  id: number;
  name: string;
  version: number;
  published: boolean;
  description: string;
  importCount: number;
  usedBy: number;
  deviceNames: string[];
  widgetCount: number;
  rowCount: number;
  folder: string | null;
  archived?: boolean;
}

export interface SceneSummary {
  id: number;
  name: string;
  keyCount: number;
  createdAt: number;
}

export interface LayoutRecord {
  id: number;
  name: string;
  version: number;
  document: LayoutT;
  published: boolean;
  description: string;
  importCount: number;
}

export interface HubItem {
  id: number;
  name: string;
  description: string;
  author: string;
  importCount: number;
  document: LayoutT;
  reviewStatus?: string;
}

export interface TaskItem {
  id: number;
  text: string;
  done: boolean;
}

export interface QueueState {
  id: string;
  title: string;
  now_serving: number;
  waiting: number;
}

// The CSRF token the server set in the readable glanceos_csrf cookie at login;
// echoed in x-csrf-token on every mutating request (stateless double-submit).
function csrfToken(): string {
  const m = /(?:^|;\s*)glanceos_csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]!) : "";
}

async function errorDetail(res: Response): Promise<string> {
  // Rate limit: the server already sends retry-after (clamped to 1-60s), so say how
  // long instead of leaving someone to guess whether they're locked out for good.
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    return after > 0 ? `Too many attempts — try again in ${after}s.` : "Too many attempts — try again in a moment.";
  }
  let detail = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { error?: string; issues?: Array<{ path: Array<string | number>; message: string }> };
    if (j.error) detail = j.error;
    // "validation — email: Invalid email address" is our internal shape leaking out.
    // When every issue names a field, just say the field's problem.
    if (j.issues?.length) {
      const parts = j.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
      detail = j.error === "validation" ? parts.join("; ") : `${detail} — ${parts.join("; ")}`;
    }
  } catch {
    // non-JSON error body; keep the status text
  }
  return detail;
}

// The session ended underneath a request. app.tsx registers a handler that re-opens
// the sign-in card without unmounting the page you were on, so unsaved work survives.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

// /api/auth/* is exempt: a failed login is a 401 by design and must not be mistaken
// for an expired session (that would re-open the very card you're already on).
function noteStatus(res: Response, path: string): void {
  if (res.status === 401 && !path.startsWith("/api/auth/")) onUnauthorized?.();
}

const OFFLINE = "Can't reach the server — check that GlanceOS is running.";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrfToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // A network-layer failure surfaces as a bare TypeError — "Load failed" in Safari,
    // which tells the user nothing about what went wrong or what to do.
    throw new Error(OFFLINE);
  }
  if (!res.ok) {
    noteStatus(res, path);
    if (res.status === 401 && !path.startsWith("/api/auth/")) throw new Error("your session ended — log in again");
    throw new Error(await errorDetail(res));
  }
  return (await res.json()) as T;
}

// Multipart upload (e.g. images): the browser must set content-type + boundary,
// so this can't go through request(). It still carries the CSRF token — the same
// double-submit header every mutating call needs, or the guard returns 403
// "bad or missing csrf token".
async function upload<T>(path: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "x-csrf-token": csrfToken() },
      body: form,
      credentials: "same-origin",
    });
  } catch {
    throw new Error(OFFLINE);
  }
  if (!res.ok) {
    noteStatus(res, path);
    if (res.status === 401) throw new Error("your session ended — log in again");
    throw new Error(await errorDetail(res));
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  upload: <T>(path: string, form: FormData) => upload<T>(path, form),
};
