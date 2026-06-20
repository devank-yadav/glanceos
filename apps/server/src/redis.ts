import { deliverLocal, setHubBackend, type HubBackend } from "./hub";
import { setRateBackend, type RateBackend } from "./ratelimit";

// Optional horizontal-scale backend (opt-in via GLANCEOS_REDIS_URL). When set,
// SSE emits fan out across processes over Redis pub/sub and rate-limit windows
// are shared, so GlanceOS can run behind a load balancer with several replicas.
// `ioredis` is NOT a declared dependency — install it yourself only if you set
// the env var (keeps the default single-process path zero-dependency).
//
// HONESTY: this path is NOT exercised by the test suite or CI (it needs a live
// Redis + multiple processes). Load-test a real multi-replica deployment before
// relying on it. It assumes a device's SSE connection is sticky to one replica
// (use sticky sessions on the LB); a replica that crashes leaves stale presence
// entries until they are re-reconciled.

// Minimal structural type for just the ioredis calls we use (avoids a hard dep).
interface RedisLike {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<unknown>;
  on(event: "message", cb: (channel: string, message: string) => void): void;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
}
type RedisCtor = new (url: string) => RedisLike;

const EMIT_CHANNEL = "glanceos:emit";
const PRESENCE_CHANNEL = "glanceos:presence";
const PRESENCE_SET = "glanceos:presence:set";
const RL_PREFIX = "glanceos:rl:";

interface EmitMsg { d: string; e: string; p: string; i?: string }

/** Wire the Redis-backed hub + rate-limit backends. Throws a clear error if
 *  GLANCEOS_REDIS_URL is set but `ioredis` isn't installed. */
export async function initRedis(url: string): Promise<void> {
  // Non-literal specifier so tsc doesn't try to resolve the optional module.
  const specifier = "ioredis";
  const mod = (await import(specifier).catch(() => null)) as { default: RedisCtor } | null;
  if (!mod?.default) {
    throw new Error("GLANCEOS_REDIS_URL is set but 'ioredis' is not installed. Run: pnpm --filter @glanceos/server add ioredis");
  }
  const Redis = mod.default;
  const pub = new Redis(url); // commands + publish
  const sub = new Redis(url); // a subscribed connection can't run other commands

  // --- hub: cross-process emit + a pub/sub-maintained presence mirror ---
  const presence = new Set<string>();
  try {
    for (const id of await pub.smembers(PRESENCE_SET)) presence.add(id);
  } catch {
    /* empty or unreachable — start cold */
  }

  await sub.subscribe(EMIT_CHANNEL);
  await sub.subscribe(PRESENCE_CHANNEL);
  sub.on("message", (channel, message) => {
    if (channel === EMIT_CHANNEL) {
      try {
        const m = JSON.parse(message) as EmitMsg;
        void deliverLocal(m.d, m.e, m.p, m.i); // every replica delivers to its own subscribers → exactly once each
      } catch {
        /* ignore malformed */
      }
    } else if (channel === PRESENCE_CHANNEL) {
      const op = message.slice(0, 1);
      const id = message.slice(2); // "c:<id>" / "d:<id>" — device ids are UUIDs (no ':')
      if (!id) return;
      if (op === "c") presence.add(id);
      else if (op === "d") presence.delete(id);
    }
  });

  const hub: HubBackend = {
    publish: (deviceId, event, payload, id) => {
      const msg: EmitMsg = { d: deviceId, e: event, p: payload, i: id };
      void pub.publish(EMIT_CHANNEL, JSON.stringify(msg));
    },
    onConnect: (deviceId) => {
      void pub.sadd(PRESENCE_SET, deviceId);
      void pub.publish(PRESENCE_CHANNEL, `c:${deviceId}`);
    },
    onDisconnect: (deviceId) => {
      void pub.srem(PRESENCE_SET, deviceId);
      void pub.publish(PRESENCE_CHANNEL, `d:${deviceId}`);
    },
    isConnected: (deviceId) => presence.has(deviceId),
    connectedDeviceIds: () => [...presence],
  };
  setHubBackend(hub);

  // --- rate limit: shared fixed window via INCR + PEXPIRE ---
  const rate: RateBackend = {
    check: async (key, limit, windowMs) => {
      const k = RL_PREFIX + key;
      const count = await pub.incr(k);
      if (count === 1) await pub.pexpire(k, windowMs);
      if (count > limit) {
        const ttl = await pub.pttl(k);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((ttl > 0 ? ttl : windowMs) / 1000)) };
      }
      return { ok: true, retryAfter: 0 };
    },
  };
  setRateBackend(rate);
}
