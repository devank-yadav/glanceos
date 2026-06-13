# apps/screen

The dashboard runtime — the thing every screen actually displays, from a 4K TV to (via the future render pipeline) a 1-bit e-paper panel. Built in v0.1 with Track A skills; vanilla TypeScript + Vite, **no framework**, conservative `es2017` build target because old smart-TV browsers are first-class citizens. The whole bundle is ~5 kB of JS.

**Run it:** `pnpm dev` (port 5173, proxies `/api` to :8080). Production build is served by the server at `/screen`.

**Reading order for study:**

| File | Idea |
|---|---|
| `src/main.ts` | boot: paint cached state first, then let the stream overwrite it — *dumb glass, not amnesiac* |
| `src/api.ts` | identity (localStorage), self-registration, the EventSource wrapper and why SSE auth rides query params |
| `src/render.ts` | state document in → CSS grid out; claim screen; stale dot |
| `src/widgets.ts` | the entire widget contract: `(el, widget, data) → cleanup?` — this hand-rolled interface is the Track A capstone |

**Behaviors worth tracing:** unclaimed devices render their own claim code (no runtime ever implements pairing UI); a killed server leaves the cached dashboard up with a quiet stale dot; the clock ticks locally between pushes.

**Must never contain:** a framework, business logic, secrets or API keys, or any network call to anything that isn't the GlanceOS server.
