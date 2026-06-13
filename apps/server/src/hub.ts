// The SSE hub: deviceId → live connections. Deliberately tiny — the whole
// push story is "send the new state to whoever is listening".

type Send = (event: string, data: string, id?: string) => void | Promise<void>;

const subscribers = new Map<string, Set<Send>>();

export function subscribe(deviceId: string, send: Send): () => void {
  let set = subscribers.get(deviceId);
  if (!set) {
    set = new Set();
    subscribers.set(deviceId, set);
  }
  set.add(send);
  return () => {
    set.delete(send);
    if (set.size === 0) subscribers.delete(deviceId);
  };
}

export function isConnected(deviceId: string): boolean {
  return subscribers.has(deviceId);
}

export function connectedDeviceIds(): string[] {
  return [...subscribers.keys()];
}

export async function emit(deviceId: string, event: string, data: unknown, id?: string): Promise<void> {
  const set = subscribers.get(deviceId);
  if (!set) return;
  const payload = JSON.stringify(data);
  for (const send of [...set]) {
    try {
      await send(event, payload, id);
    } catch {
      set.delete(send); // connection died mid-write; the abort handler will tidy up
    }
  }
}
