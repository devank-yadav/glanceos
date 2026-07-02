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
  let detail = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { error?: string; issues?: Array<{ path: Array<string | number>; message: string }> };
    if (j.error) detail = j.error;
    if (j.issues) detail += ` — ${j.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
  } catch {
    // non-JSON error body; keep the status text
  }
  return detail;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrfToken();
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return (await res.json()) as T;
}

// Multipart upload (e.g. images): the browser must set content-type + boundary,
// so this can't go through request(). It still carries the CSRF token — the same
// double-submit header every mutating call needs, or the guard returns 403
// "bad or missing csrf token".
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "x-csrf-token": csrfToken() },
    body: form,
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(await errorDetail(res));
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
