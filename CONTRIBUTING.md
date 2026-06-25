# Contributing to GlanceOS

Thanks for your interest! GlanceOS is open source (MIT) and self-hosted — every
feature is free.

A heads-up on scope: this is a **learning build**, and before 1.0 I'll mostly
**decline code PRs** (the codebase doubles as my own study material). What's
*most* welcome: **bug reports, ideas, new-integration requests, and prior-art
pointers** via [issues](https://github.com/devank-yadav/glanceos/issues). Forks
are encouraged — this guide is the setup steps and the house rules so you (or a
future me) can build on it cleanly. If you do open a PR, keep it small and expect
it may sit until after 1.0.

## Quick start

You need **Node ≥ 24** and **pnpm 11** (`corepack enable` will pin the right
version from `packageManager`).

```bash
git clone https://github.com/devank-yadav/glanceos
cd glanceos
pnpm install
pnpm dev          # runs server + config + screen dev servers in parallel
```

- **config** (the app you log into) — http://localhost:5173
- **screen** (the dumb-glass runtime a TV/e-ink panel loads) — http://localhost:5174
- **server** (API + SSE) — http://localhost:8080

The first account you create becomes the admin.

## Repository layout

A pnpm workspace. `apps/*` and `packages/*` are workspaces; `devices/*` is **not**
(it holds native shells and image configs with their own toolchains).

| Path | What it is |
| --- | --- |
| `packages/schema` | The zod contract for a board document — the shared source of truth. |
| `apps/server` | Hono API + better-sqlite3 + SSE hub + the integration provider registry + fetchers. |
| `apps/screen` | The vanilla-TS dashboard runtime. **No framework, no zod** — it must stay tiny. |
| `apps/config` | The Preact PWA: auth, the Studio editor, fleet, settings. |
| `devices/*` | Native/kiosk shells: Raspberry Pi, Android TV/Fire TV, Tizen, webOS, tvOS. |
| `docs/` | Architecture, device API, deploy, ADRs, integration catalog. |

## Non-negotiables (CI enforces these)

1. **`apps/screen` stays tiny and dependency-light.** The runtime ships to e-ink
   panels and old smart-TVs. **zod must never be imported into `apps/screen`**, and
   the entry chunk must stay **≤ 30 KB gzipped** (`pnpm --filter @glanceos/screen size`).
2. **Schema changes are additive.** Add optional, defaulted fields so old board
   documents keep parsing — avoid a breaking schema bump.
3. **Database migrations are additive + backfilled.** New SQL files in
   `apps/server/migrations/` only; never edit an applied migration. New columns get
   sane defaults so existing rows stay valid.
4. **Everything stays green.** `pnpm typecheck`, `pnpm test`, `pnpm build`, and the
   screen size gate all pass before you open a PR.

## Adding an integration (provider)

Providers live entirely server-side in `apps/server/src/providers/registry.ts` —
adding one costs the screen runtime **zero bytes**. A provider is a `reg({...})`
with an `id`, `category`, `authKind`, `resources[]`, and a `resolve()` that returns
a raw payload (a list `{items:[…]}` or scalar `{value}`). Keyless public APIs are
the easiest — they render immediately. When you add one:

- bump the count + add an assertion in `apps/server/src/providers/registry.test.ts`;
- regenerate the catalog: `node apps/server/scripts/gen-integrations-doc.mjs --write`.

## Adding a board template

Add a validated `LayoutT` to `apps/config/src/starterTemplates.ts`. The
`starterTemplates.test.ts` suite parses every template against the schema, so a
template can never ship a board the runtime can't render.

## Commit & PR

- Keep PRs focused; one logical change per PR.
- Write a clear title and describe the *why*, not just the *what*.
- Make sure the four checks above pass locally; CI runs the same.
- New behavior gets a test where practical.

## Code style

- TypeScript everywhere (except `devices/*` native shells).
- Match the surrounding code — naming, comment density, idioms.
- ESLint + Prettier are configured; run them before pushing.

By contributing you agree your contributions are licensed under the repository's
[MIT license](LICENSE).
