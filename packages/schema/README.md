# packages/schema

The contract. Every shape shared across the platform lives here as a zod schema, and everything else — server, screen, config app, eventually firmware docs — obeys it. The project rule comes from here:

> If the schema can't express it, the feature doesn't exist.

Built in v0.1; consumed as TypeScript source by every other package (no build step — tsx and Vite both compile it in place).

**Files:**

| File | Contents |
|---|---|
| `src/layout.ts` | the layout document (v3): rows with a height in units, each holding 1–4 blocks with width weights; the widget discriminated union spans **46 block types** with per-type props (image/avatar/link URLs are protocol-locked to http/https) |
| `src/migrate.ts` | `parseDocument` — migrate-on-read from v1 (grid) and v2 (height-less rows) to v3 |
| `src/data.ts` | what the server's fetchers produce and screens render (weather, events, tasks, queue) |
| `src/device.ts` | device profile, screen-state document, and the SSE `StreamPayload` union (unclaimed → claim code; claimed → state) |
| `src/api.ts` | request/response shapes for register and claim |
| `src/fixtures.ts` | the four golden layouts (personal / clinic / home / welcome) — parsed at module load so an invalid fixture fails loudly; they seed the hub as GlanceOS builtins |

Types come from `z.infer` only — no hand-maintained duplicates. `z.toJSONSchema()` export for firmware lands with P5.

**Must never contain:** runtime logic, I/O, or anything with a side effect. Schemas and types only.
