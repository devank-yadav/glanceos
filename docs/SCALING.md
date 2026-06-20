# Scaling GlanceOS

GlanceOS is built to be **boring to self-host**: one process, one SQLite file, no
external services. That comfortably drives dozens — realistically a few hundred —
screens on a single small box. This page is about what to do *after* that, and is
honest about what's proven versus what's a documented seam.

> **Status:** the single-process default is the tested, supported path. The
> multi-process Redis path below is an **opt-in seam** that is *not* exercised by
> CI (it needs a live Redis + several processes). Load-test your own deployment
> before relying on it.

## The single-process ceiling (the default)

- **SQLite (better-sqlite3, WAL mode).** Reads are concurrent; writes are
  serialized through one writer. For a dashboard fleet this is rarely the limit —
  writes are small (telemetry, schedule edits, proof-of-play batches). The WAL is
  checkpointed on a timer (`db.checkpoint()`), and proof-of-play is pruned on a
  retention timer so the file can't grow without bound.
- **In-memory SSE hub.** Live connections live in the process; an emit walks the
  local subscriber set. Fine until you need more than one process.
- **In-memory rate limiter.** Fixed windows in a `Map`, per process.

When one box runs out of CPU/RAM for the number of connected screens, you scale
*out* — several server processes behind a load balancer. That needs two things to
stay correct across processes: **SSE fan-out** and **shared rate-limit windows**.

## Multi-process scale (opt-in, Redis)

Set `GLANCEOS_REDIS_URL` (e.g. `redis://127.0.0.1:6379`) and install `ioredis`
(it is **not** a default dependency — the zero-config path stays dependency-free):

```sh
pnpm --filter @glanceos/server add ioredis
GLANCEOS_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @glanceos/server start
```

What it wires (see `apps/server/src/redis.ts`, behind the `HubBackend` /
`RateBackend` seams in `hub.ts` / `ratelimit.ts`):

- **SSE fan-out.** `emit()` publishes to a Redis channel instead of delivering
  locally; every process subscribes and delivers to *its own* connections — so a
  board edit on process A reaches a screen connected to process B, exactly once
  per process.
- **Presence mirror.** Each process keeps a local set of globally-connected
  device ids, kept in sync over a presence pub/sub channel (so `isConnected()`
  stays synchronous for the push hot-paths). Hydrated from a Redis set on boot.
- **Shared rate limits.** `limiter` counts against a Redis `INCR`+`PEXPIRE`
  window keyed the same way, so a client can't get N× the budget by hitting N
  replicas.

**Run it behind sticky sessions.** The design assumes a screen's long-lived SSE
connection stays pinned to one replica (configure sticky sessions on the LB).
A replica that crashes leaves stale presence entries until they age out / are
reconciled — acceptable for the optimization they serve (skipping a compose when
nobody is listening), but worth knowing.

**Honesty:** this path is real code but is **not** covered by the test suite or
CI, because that needs a live Redis and multiple processes. The seam itself (the
in-memory default, and that a swapped backend is used) *is* tested. Treat the
Redis path as "load-test before you trust it."

## Postgres — designed, deliberately deferred

The plan floated a Postgres adapter for `db.ts` to lift the single-writer ceiling.
After mapping the code, it is **deliberately not shipped**, and here is the honest
reason:

- The entire data layer is **synchronous** (`better-sqlite3`: `db.prepare().get/
  all/run()`), used directly by ~19 modules with no abstraction, and called
  synchronously *inside* async HTTP handlers.
- A Postgres client is **asynchronous**. Swapping it in is not an "adapter" — it
  forces every one of those call sites (and the `db.transaction()` helper) to
  become `async`/`await`. That's a rewrite of the data layer, not a drop-in, and
  it contradicts this project's "extend, don't replace" rule.

So SQLite stays the default and the recommended store. If you genuinely outgrow a
single writer (sustained heavy proof-of-play at fleet scale is the most likely
trigger), the correct path is a focused, tested migration to an async data layer
behind a `Store` interface — a project of its own, with the full test suite green
against both backends — not a half-built adapter bolted on here. Until then, the
mitigations that already exist (batched proof-of-play writes, retention pruning,
WAL checkpointing) keep the single writer healthy far longer than most fleets
will ever need.

## Practical guidance

- **Most self-hosters:** do nothing. One process + SQLite is the supported path.
- **Outgrowing one box:** add Redis + `ioredis`, run several processes behind a
  sticky-session LB, and load-test to your target connection count first.
- **Outgrowing one SQLite writer:** that's the signal to invest in the async
  `Store` migration above — not before.
