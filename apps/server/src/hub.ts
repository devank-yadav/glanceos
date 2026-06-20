// The SSE hub: deviceId → live connections. The whole push story is "send the
// new state to whoever is listening". Live SSE callbacks always live in *this*
// process (a function can't cross a process boundary), so we keep a local map of
// them. How an emit REACHES every process — and how presence is known across
// processes — is delegated to a pluggable backend. The default is in-memory
// (single process, zero config); an optional Redis backend (see hub-redis.ts,
// opt-in via GLANCEOS_REDIS_URL) fans emits out over pub/sub so a horizontally
// scaled fleet stays in sync. The public API below never changes shape.

type Send = (event: string, data: string, id?: string) => void | Promise<void>;

const local = new Map<string, Set<Send>>();

/** Deliver an already-serialized event to this process's local subscribers.
 *  Exported so a backend's cross-process receiver can hand a message back in. */
export async function deliverLocal(deviceId: string, event: string, payload: string, id?: string): Promise<void> {
  const set = local.get(deviceId);
  if (!set) return;
  for (const send of [...set]) {
    try {
      await send(event, payload, id);
    } catch {
      set.delete(send); // connection died mid-write; the abort handler will tidy up
    }
  }
}

/** A hub backend decides how a published event reaches every process and how
 *  cross-process presence is known. `isConnected`/`connectedDeviceIds` must be
 *  synchronous (callers use them in sync paths), so a distributed backend keeps
 *  a local, pub/sub-maintained mirror of global presence. */
export interface HubBackend {
  publish(deviceId: string, event: string, payload: string, id?: string): void | Promise<void>;
  onConnect(deviceId: string): void; // a device gained its first local subscriber
  onDisconnect(deviceId: string): void; // a device's last local subscriber went away
  isConnected(deviceId: string): boolean;
  connectedDeviceIds(): string[];
}

// In-memory backend: an emit is delivered straight to local subscribers, and
// presence IS the local map. Behavior is byte-identical to the pre-seam hub.
const memoryBackend: HubBackend = {
  publish: (deviceId, event, payload, id) => deliverLocal(deviceId, event, payload, id),
  onConnect: () => {},
  onDisconnect: () => {},
  isConnected: (deviceId) => local.has(deviceId),
  connectedDeviceIds: () => [...local.keys()],
};

let backend: HubBackend = memoryBackend;

/** Swap the hub backend (the Redis init calls this at boot). */
export function setHubBackend(b: HubBackend): void {
  backend = b;
}

export function subscribe(deviceId: string, send: Send): () => void {
  let set = local.get(deviceId);
  const first = !set;
  if (!set) {
    set = new Set();
    local.set(deviceId, set);
  }
  set.add(send);
  if (first) backend.onConnect(deviceId);
  return () => {
    set.delete(send);
    if (set.size === 0) {
      local.delete(deviceId);
      backend.onDisconnect(deviceId);
    }
  };
}

export function isConnected(deviceId: string): boolean {
  return backend.isConnected(deviceId);
}

export function connectedDeviceIds(): string[] {
  return backend.connectedDeviceIds();
}

export async function emit(deviceId: string, event: string, data: unknown, id?: string): Promise<void> {
  await backend.publish(deviceId, event, JSON.stringify(data), id);
}
