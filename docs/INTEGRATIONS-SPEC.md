# GlanceOS — Locked Implementation Spec: On-Board Editing · Integrations · Smart Data

> Produced by an independent design panel (4 architectures → 3 judges → synthesis),
> every signature/DDL verified against the real code. This is the contract the
> build follows. Phases P0–P6 are each independently shippable and verifiable.

## 1. Overview & principles

Three additive layers bolt onto existing primitives:

1. **Smart data** rides on **one new optional field on the block base `b`** —
   `source: BlockSource.optional()` — added exactly the way `style:
   BlockStyle.prefault({})` was. It spreads to all ~200 union variants for free;
   `.optional()` means an unbound block serializes with **no `source` key**, so
   every existing v3 layout stays byte-identical: **no migration, still v3**.
2. **Integrations** are a per-user `connections` table (migration **005**) holding
   **AES-256-GCM-encrypted secrets that never leave the server**, fronted by a
   static provider registry. "Works-today" providers (private iCal URL; generic
   REST/JSON/GraphQL; personal tokens for Todoist/GitHub/Notion/Linear;
   published-CSV Sheets) function immediately. OAuth providers are fully
   scaffolded but **gated on user-supplied client id/secret**.
3. **On-board editing** anchors a floating toolbar + popover to the block via the
   editor's existing `geometry.blocks` boxes, reusing the scaled-coord math that
   positions `.inline-edit`. Single-click opens it; the ⠿ handle still moves.
   `PropertiesPanel` is **demoted, not deleted**.

**Hard invariants:**
- zod stays OUT of `apps/screen` (it imports binding types `type`-only).
- Offline-safe: every resolver path goes through `cached()` (never throws) →
  dead provider → `null` → the renderer's existing `placeholder()`. Tests never
  hit network.
- No secret ever reaches the client (one secret-stripped serializer).
- Props are the offline fallback: a bound block that resolves `null` renders its
  typed-in props.

**Two corrections baked in:** (A) charts read `nums(w.props.values)` and ignore
the `data` arg, so a screen-side `boundNums`/`boundText` bridge is mandatory, not
"zero change." (B) the resolver loop is `Promise.all(blocks.map(async b => …))`,
so the binding guard is an early `return`, not `continue`. (C) the cache key is
`connection+kind+query-hash` (NOT block id) so N blocks on one source dedup to one
fetch.

## 2. Schema change

New shared zod objects above `const b` in `layout.ts`:

```ts
export const SourceMap = z.object({
  path: z.string().max(400).default(""),
  items: z.string().max(400).optional(),
  fields: z.record(z.string(), z.string().max(400)).optional(),
  transform: z.enum(["none","series","count","sum","first","last","join","percent"]).default("none"),
}).prefault({});

export const BlockSource = z.object({
  connectionId: z.string().min(1).optional(),   // FK → connections.id; absent = anonymous URL
  kind: z.string().min(1).max(64),              // "todoist.tasks" | "ical.events" | "rest" | ...
  query: z.record(z.string(), z.string().max(2000)).prefault({}),
  map: SourceMap,
  refreshSeconds: z.number().int().min(30).max(86400).optional(),
});
```

The one-line base change:

```ts
const b = { id: ..., width: ..., style: BlockStyle.prefault({}), source: BlockSource.optional() };
```

`.optional()` (not `.prefault`): a binding is meaningfully absent vs present; old
docs lack the key and parse unchanged. v1 ships **one `source` per block**; a
future `sources: z.array(...).optional()` is an additive upgrade.

## 3. DB migration 005 + crypto + connections

`migrations/005_connections.sql`: `connections` (id, user_id FK cascade, provider,
label, auth_kind, config JSON non-secret, status, last_error, timestamps) +
`connection_secrets` (connection_id FK, kind, key_version, cipher BLOB) +
`oauth_apps` (provider, user_id, client_id, client_secret_enc, key_version).

`secrets.ts`: AES-256-GCM via `node:crypto`. Key from `GLANCEOS_SECRET_KEY` env,
else auto-derive a `0600` `data/secret.key` with a first-boot warning.
`seal(plain): Buffer` = `iv|tag|ciphertext`; `open(buf): string|null` (never
throws → `null` → `needs_auth`).

`connections.ts`: `ConnectionSummary` (the only shape sent to clients — no
secrets) and internal `ResolvedConn` with lazy `secret()`. Every query is
`WHERE id = ? AND user_id = ?`.

## 4. Provider registry + works-today providers

`providers/registry.ts`: `Provider { id, label, category, authKind, defaultTtlMs,
resources: ProviderResource[], resolve(ctx), oauth? }`. A `Map<string,Provider>`;
no network at import.

Works-today (no OAuth): **Generic REST/JSON** (`rest`), **GraphQL** (`graphql`),
**iCal URL** (`ical.events` — Google/Apple/Outlook calendars via secret `.ics`),
**Todoist** (`todoist.tasks`), **GitHub** (`github.issues|repo|commits`),
**Linear** (`linear.issues`), **Notion** (`notion.database`), **Google Sheets
published CSV** (`sheets.csv`), **RSS/Atom** (`rss.feed`).

Normalized outputs: **series** → `number[]`; **scalar** → `string|number`;
**list** → `[{text,done?}]` or newline string; **table** → header+CSV rows;
**events** → `parseIcs()` output.

## 5. Server binding resolver

One guarded branch in `resolveWidgetData`'s `Promise.all(map)` loop: if
`b.source`, `data[b.id] = await resolveSource(b.source, userId, b.id)` (early
`return`), else the existing `switch`. `resolveSource` → provider.resolve via
`cached(key, ttl, FAIL, fn)`, key = `src:${conn?.id ?? "url"}:${kind}:${hash(query)}`,
then `applyMap(raw, map)` (generalized `{{dotted.path}}` + items/fields/transform).

**SSRF guard** in the shared `cache.ts` egress (`getJSON`/`getText`):
`assertSafeUrl` resolves DNS before fetch and blocks private/loopback/link-local
ranges unless `GLANCEOS_ALLOW_PRIVATE_EGRESS=1`. Retro-protects existing
jsonFeed/ics/headlines.

## 6. Config app

`/api/connections` CRUD (never returns secrets) + `:id/resources` + `:id/sample`
(runs resolver once, secrets stripped) + `/api/source/preview` (anonymous URL) +
`/api/oauth-apps/:provider` + `/api/oauth/:provider/{start,callback}`. New
Integrations page + nav link + hash route; connect flow per auth kind (paste
URL/token instantly; OAuth gated on `oauth_apps`).

## 7. On-board editing

Floating `BlockToolbar` anchored via `geometry.blocks` (sibling of `.inline-edit`,
same `*scale` math, flip-below near top edge). Pills:
`[≡ Type] [✎ Edit] [⟿ Data] [◧ Style] [⋯ More] [⌫]`. ⠿ handle still moves;
toolbar/popover `stopPropagation` + `toolbarOpen` in `overlayRef`.

In-place editing: generalize `.inline-edit` to sub-rects (`cellRectFor`) — table
cells (rewrite CSV) and list lines (Enter splits, Backspace-empty removes). No
schema change.

"Data" popover: connection → resource (sets `defaultMap`) → live sample
(click-to-pick a field) → transform. `PropertiesPanel` demoted to board settings +
an "All fields" power drawer.

## 8. Smart blocks — bindable list + screen bridge

`boundNums(w, data)` / `boundText(w, data, prop)` helpers in `apps/screen` (no
zod): prefer resolved `data`, fall back to prop string. Renderers change one line.
Bindable: charts (`values`→series), scalars (`stat/metric/bigNumber/...`→value),
percent/gauge, lists (`bulletList/checklist/headlines/...`→items), `table`,
`calendar` (events). Computed blocks (clock, moon, etc.) are NOT bindable.

## 9. OAuth2 scaffolding (gated)

Generic auth-code + refresh, registry-driven, inert until the self-hoster pastes
`client_id`/`client_secret`. `start` (412 if no app, else 302 with HMAC `state`,
PKCE for Google) → `callback` (verify state, exchange, `seal` tokens) → refresh on
expiry. **`GLANCEOS_PUBLIC_URL`** env fixes the `127.0.0.1` redirect-uri bug behind
a reverse proxy. Google (PKCE, offline) / Microsoft / Notion / Apple (primary path
is iCloud `.ics`; optional CalDAV app-specific password later).

## 10. Phased build order

- **P0 — Toolbar**: floating `BlockToolbar`; single-click shows it; ⠿ still moves;
  demote `PropertiesPanel`. Config only, offline.
- **P1 — In-place editing**: table cells / list lines via `cellRectFor`. Config only.
- **P2 — SSRF guard**: `assertSafeUrl` in `cache.ts`. Server only.
- **P3 — Smart data (public URL)**: `source` field; `resolveSource`+`applyMap`;
  `rest/graphql/ical.events/sheets.csv`; screen bridge; `/api/source/preview`.
- **P4 — Connections + token providers**: 005; `secrets.ts`; `connections.ts`;
  `/api/connections`; Todoist/GitHub/Notion/Linear.
- **P5 — Data-tab UX + registry breadth**: Integrations page + Data popover.
- **P6 — OAuth scaffolding**: `oauth_apps`, `/api/oauth/*`, `GLANCEOS_PUBLIC_URL`.

## 11. Risks & mitigations

Charts need the bridge (budgeted). SSRF lands before URL sources. Cache key =
connection+kind+query (not block id) to dedup. Secret-key loss → `needs_auth`, not
crash. OAuth inert until credentialed + `GLANCEOS_PUBLIC_URL` fixes redirects.
Wrong-shaped bindings → `applyMap` null → props fallback. `PropertiesPanel`
demoted not deleted (board settings preserved). `BlockSource` lenient (no
`.strict()`).
