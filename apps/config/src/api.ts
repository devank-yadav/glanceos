import type { LayoutT } from "@glanceos/schema";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
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
  renderOpts: { algo?: string; threshold?: number; gamma?: number };
  createdAt: number;
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
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
