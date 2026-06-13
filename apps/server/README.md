# apps/server

The platform daemon — the single source of truth. Built in v0.1 with Tracks C/D skills ([LEARNING-PATH](../../docs/LEARNING-PATH.md)); per [DECISIONS 014](../../docs/DECISIONS.md) it now doubles as study material.

**Run it:** `pnpm dev` (tsx watch, port 8080; `PORT` env overrides). Data lands in `data/glanceos.db` (gitignored).

**Reading order for study** — each file is one idea:

| File | Idea |
|---|---|
| `src/db.ts` | SQLite + the hand-rolled numbered-`.sql` migration runner |
| `src/ids.ts` | device identity + unambiguous claim codes |
| `src/auth.ts` | scrypt password + DB sessions guarding the config plane |
| `src/devices.ts` / `src/layouts.ts` | the registry: register → claim → assign; versioned layout documents |
| `src/hub.ts` | the entire SSE hub, ~40 lines |
| `src/state.ts` | screen-state composition and the push paths |
| `src/widgets.ts` + `src/fetchers/` | widget data pipeline (Open-Meteo, ICS, 16 live sources, jsonFeed polling) with caching |
| `src/playlists.ts` | screen rotation: a playlist's current item is deterministic from the clock |
| `src/render/` | e-ink pipeline — Chromium screenshot → sharp grayscale → Floyd–Steinberg dither → 1-bit BMP / `raw1` / PNG (dither + encoders unit-tested) |
| `src/tasks.ts` / `src/queues.ts` | the widget-backing stores |
| `src/api.ts` | every route; static serving of both built frontends |

**API map (v0.2, multi-user — [DECISIONS 018](../../docs/DECISIONS.md)):**
- Auth: `POST /api/auth/register|login|logout`, `GET /api/auth/status` (registration closable via `GLANCEOS_REGISTRATION=closed`; first account always allowed)
- Device plane (open, device-credential auth — unchanged since v0.1): `POST /api/devices/register`, `GET /api/devices/me`, `GET /api/devices/me/stream` (SSE, query auth — EventSource can't set headers)
- Screens: `GET /api/devices` (mine, with `layoutName`) · `POST /api/devices/claim` (binds to my account, assigns NO layout) · `PATCH|DELETE /api/devices/:id` (delete keeps the setup)
- Setups: `GET|POST /api/layouts` · `GET|PUT|PATCH|DELETE /api/layouts/:id` (PUT = the studio's autosave; bumps version, fans out over SSE) · `POST /api/layouts/:id/duplicate` · `POST /api/layouts/preview-state` (draft → widget data, no side effects)
- Hub ([019](../../docs/DECISIONS.md)): `GET /api/hub?q=` · `POST /api/hub/:id/import`
- Data: `/api/tasks*`, `/api/queues/:id/*` — per-user namespaces

Everything outside `/api/auth/*` and the three device-plane paths requires a session; cross-user access is a 404.

**Tests:** `pnpm test` — 24: ICS parser (folding, escaping, all-day, RRULE), claim codes, the multi-user integration flow (registration, isolation, hub publish→import, builtin protection, preview-state), and the real v0.1→v0.2 migration upgrade path (`src/migration.test.ts`).

**Known gaps (tracked):** ICS TZID values are treated as server-local time (P4); the e-ink render pipeline doesn't exist yet (P5); no email verification / password reset ([018](../../docs/DECISIONS.md)).

**Must never contain:** frontend/UI code, device-specific hacks, or client-side fetching — screens never talk to third parties ([DECISIONS 012](../../docs/DECISIONS.md)).
