import type { StreamPayloadT } from "@glanceos/schema";
import type { AlertPayload } from "./alert";

export interface Identity {
  deviceId: string;
  deviceSecret: string;
}

const ID_KEY = "glanceos.identity";

function authHeaders(id: Identity): Record<string, string> {
  return { "x-device-id": id.deviceId, "x-device-secret": id.deviceSecret };
}

// #10 — fire the automation a board button is bound to (POST is device-authed; the server scopes
// it to this screen's owner). Best-effort: a tap on an offline/unbound button quietly does nothing.
export async function fireAction(automationId?: string): Promise<void> {
  if (!automationId) return;
  const raw = localStorage.getItem(ID_KEY);
  if (!raw) return;
  try {
    const id = JSON.parse(raw) as Identity;
    await fetch("/api/devices/me/action", { method: "POST", headers: { ...authHeaders(id), "content-type": "application/json" }, body: JSON.stringify({ automationId }) });
  } catch { /* offline / not yet claimed — a button tap is fire-and-forget */ }
}

/**
 * Load the stored identity, or register as a brand-new device.
 * A 401 means the server no longer knows us (wiped DB) — re-register.
 */
export async function ensureIdentity(): Promise<Identity> {
  const raw = localStorage.getItem(ID_KEY);
  if (raw) {
    const id = JSON.parse(raw) as Identity;
    try {
      const res = await fetch("/api/devices/me", { headers: authHeaders(id) });
      if (res.ok) return id;
      if (res.status !== 401) return id; // server hiccup — keep our identity
    } catch {
      return id; // offline — keep our identity, cached state will render
    }
    localStorage.removeItem(ID_KEY);
  }

  // A native shell (Fire TV / Tizen / webOS / tvOS / Pi kiosk) loads the runtime
  // with ?platform=<id>[&native=<ver>] so the fleet can show what's running it.
  const params = new URLSearchParams(location.search);
  const profile: Record<string, unknown> = {
    width: window.innerWidth,
    height: window.innerHeight,
    colorDepth: "color",
    refresh: { mode: "sse" },
  };
  const platform = params.get("platform");
  if (platform) profile.platform = platform;
  const nativeVersion = params.get("native");
  if (nativeVersion) profile.nativeVersion = nativeVersion;
  const res = await fetch("/api/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!res.ok) throw new Error(`register failed: HTTP ${res.status}`);
  const j = (await res.json()) as { deviceId: string; deviceSecret: string };
  const id: Identity = { deviceId: j.deviceId, deviceSecret: j.deviceSecret };
  localStorage.setItem(ID_KEY, JSON.stringify(id));
  return id;
}

/**
 * EventSource cannot send headers, so the stream authenticates via query
 * params. Reconnection and Last-Event-ID come for free — that is the whole
 * reason this is SSE and not a WebSocket.
 */
export interface FleetCommand { command: string; params?: Record<string, unknown> }

export function openStream(
  id: Identity,
  handlers: { onState: (payload: StreamPayloadT) => void; onDown: () => void; onCommand?: (cmd: FleetCommand) => void; onAlert?: (a: AlertPayload) => void },
): EventSource {
  const url = `/api/devices/me/stream?id=${encodeURIComponent(id.deviceId)}&secret=${encodeURIComponent(id.deviceSecret)}`;
  const es = new EventSource(url);
  es.addEventListener("state", (e) => {
    handlers.onState(JSON.parse((e as MessageEvent).data) as StreamPayloadT);
  });
  if (handlers.onCommand) {
    es.addEventListener("command", (e) => {
      try { handlers.onCommand!(JSON.parse((e as MessageEvent).data) as FleetCommand); } catch { /* ignore malformed */ }
    });
  }
  if (handlers.onAlert) {
    es.addEventListener("alert", (e) => {
      try { handlers.onAlert!(JSON.parse((e as MessageEvent).data) as AlertPayload); } catch { /* ignore malformed */ }
    });
  }
  es.onerror = () => handlers.onDown();
  return es;
}
