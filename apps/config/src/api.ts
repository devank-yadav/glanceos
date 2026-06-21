import type { LayoutT } from "@glanceos/schema";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  defaultTimezone: string | null;
  homeLocationName: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  isAdmin: boolean;
}

export interface AuthStatus {
  authed: boolean;
  user: UserInfo | null;
  registrationOpen: boolean;
}

export interface DeviceSummary {
  id: string;
  name: string | null;
  claimed: boolean;
  layoutId: number | null;
  layoutName: string | null;
  playlistId: number | null;
  online: boolean;
  refreshSeconds: number;
  battery: number | null;
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
  };
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
  playlistId: number | null;
  deviceCount: number;
}

export interface PlaylistItem {
  layoutId: number;
  name: string;
}
export interface Playlist {
  id: number;
  name: string;
  intervalSeconds: number;
  items: PlaylistItem[];
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrfToken();
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string; issues?: Array<{ path: Array<string | number>; message: string }> };
      if (j.error) detail = j.error;
      if (j.issues) detail += ` — ${j.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};
