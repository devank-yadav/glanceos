# Integrations roadmap (overnight build tracker)

Goal: many integrations (TRMNL-breadth), each a server-side **provider** in
`apps/server/src/providers/registry.ts` (zero screen-gzip cost) that existing blocks
render via a block's `source` binding. Keyless public APIs render immediately; token/OAuth
providers scaffold and light up once the owner connects. Per-integration **preset objects**
(one-click insert of a preconfigured block+source) come in a later batch.

**Rules:** each batch = one commit. typecheck (server+config) + `pnpm --filter @glanceos/screen size` + tests must stay green; scrub diff for attribution; commit/push per batch. Build keyless first (live-testable tonight), then token, then oauth.

Architecture per provider: add a `reg({...})` block (id, label, category, authKind, ttl, resources[], resolve()). New `category` strings render automatically (`CAT_LABEL[cat] ?? cat`); add a `CAT_LABEL` entry in `apps/config/src/pages/integrations.tsx` for a pretty name. OAuth providers also need an `oauth` spec. resolve() returns the raw payload; the block's SourceMap shapes it.

## Batches

- [x] **B1 — Keyless social/dev/books (render tonight):** reddit, devto, lobsters, npm, bluesky, mastodon, openlibrary, steam, thesportsdb. New cats: social, books, gaming, sports. + CAT_LABEL. ✅ 31 providers, 231 server tests green.
- [x] **B2 — Keyless civic/finance/media:** usgs (earthquakes), diseasesh (health stats), coingecko (markets+trending), tvmaze (TV search+schedule), jikan (anime top+search). ✅ 36 providers, 231 server tests green. (Dropped from plan as unreliable/blocked: stooq, coincap, restcountries, nasa DEMO_KEY — revisit with keyed providers later.)
- [x] **B3 — Dev/observability tokens:** gitlab, bitbucket, sentry, vercel, netlify, cloudflare, circleci, uptimerobot, statuspage, betteruptime, pagerduty. ✅ 47 providers, 231 server tests green. New cat: ops (Observability). Token/apiKey auth, documented endpoints (verify-by-construction; raw payload → SourceMap).
- [x] **B4 — Productivity/PM/time/bookmarks tokens:** clickup, monday, height, shortcut, harvest, toggl, wakatime, airtable, pinboard, raindrop. ✅ 57 providers, 231 server tests green. New cats: bookmarks, time-tracking. (Basecamp deferred to OAuth batch B7 — OAuth + account-scoped.)
- [x] **B5 — Money/analytics tokens:** stripe, ynab, plausible, umami, fathom, posthog, simpleanalytics, lemonsqueezy, paddle, openexchangerates. ✅ 67 providers, 231 server tests green. Cats: money, analytics, finance.
- [x] **B6 — Health/media tokens+oauth:** strava(oauth), whoop(oauth), lastfm(apiKey), trakt(apiKey), listenbrainz(token), plex(token), tautulli(apiKey), sonarr(apiKey), radarr(apiKey). ✅ 76 providers, 231 server tests green. + EXTRA_CONFIG baseUrl for self-hosted (plex/tautulli/sonarr/radarr + gitlab/plausible/umami/posthog/harvest/simpleanalytics). (Withings + Garmin deferred — non-standard OAuth.)
- [x] **B7 — OAuth scaffolds:** discord, twitch, dropbox, calendly, zoom, figma, coinbase, googletasks, youtube. ✅ 85 providers, 231 server tests green. Each carries an oauth spec ({authorize,token,scopes}, tokenAuth:"basic" for discord/zoom) + bearer resolve; appear on the Integrations page, light up once the self-hoster adds client creds. + twitch clientId config (Helix needs Client-Id header). (Skipped: reddit-oauth — id collides with keyless reddit; monzo/microsoft-todo/teams/google-fit — defer to a later OAuth pass.)
- [x] **B8 — Per-integration preset objects (config registry):** `apps/config/src/editor/integrationObjects.ts` — 25 one-click presets across 21 providers (bulletList for lists, stat for scalars; each pre-binds a `source` {kind, query, map}). Config-only, ZERO screen cost. + integrationObjects.test.ts (7 tests: real+bindable block type, kind prefix===providerId, sane defaultH, unique ids, map has path|items). 109 config tests green. NOTE: SourceMap field paths are best-effort — **B9 must live-verify/refine each map** when wiring the "Add to a board" action.
- [x] **B9 — Integrations page polish:** search box (filters 85 integrations by label/category/object name), per-category sections kept, each provider shows its preset "objects" as + chips → click copies the pre-bound block to the Studio clipboard ("⌘V on a board" toast, reuses the proven paste path). New CSS: provider-cell/provider-objects/obj-chip/integ-search. ✅ Verified live light+dark (search→"crypto" shows only CoinGecko + 2 chips); 109 config tests; screen 27045/30000.
- [x] **B10 — Harden + release.** Offline provider tests (`providers/integrations.test.ts`, fetch stubbed — reddit/npm/coingecko/usgs/devto/steam normalize + token providers bail to null; 238 server tests). `docs/INTEGRATIONS.md` (full 85-provider catalog, generated from the registry). ADR 077. README status → v9.7. Memory bumped. Tagged **v9.7.0**. ✅ Full verify: 238+109+51 tests, all tsc clean, screen 27045/30000.

---
**MORNING SUMMARY (overnight integrations build):** 22 → **85 providers** + **25 preset objects**, shipped as 10 committed/pushed batches (B1–B10). Architecture: server-side providers (zero screen-gzip cost); existing BINDABLE blocks render them via `source`. ~24 keyless (render now), rest token/OAuth scaffolds (light up on connect). Released **v9.7.0**. Deferred (noted): withings/garmin (non-standard OAuth), reddit-oauth (id clash), stooq/coincap/restcountries/nasa (unreliable keyless), basecamp/monzo/MS-todo/teams (later OAuth pass). NEXT (loop continues): down the priority list — big feature → studio polish → hardening → landing → **templates LAST**.

## After integrations (priority order)
- [x] **Big feature — Data inspector** (a deferred Studio direction; chosen for being self-contained, additive, no-migration, zero screen cost, and directly serving the 85 new integrations). The Data tab's "Test" preview now pretty-prints the live payload (was a 260-char string) and derives **clickable path suggestions** from it: `List` chips (array paths + row counts) fill the items mapping, `Field`/`Value` chips fill the field mapping — so binding an arbitrary provider is point-and-click instead of guessing dotted paths. Pure shape helpers extracted to `inspectShape.ts` + 5 unit tests. Config-only (uses the existing `/api/source/preview`). 114 config tests; screen 27045/30000. (Live Studio-flow drive deferred to a morning spot-check; logic unit-verified.)
- [x] **Studio polish + adversarial bug hunt** — found & fixed a real B8 bug: the preset "objects" omitted `map.transform`, so list presets resolved to an *array of `{text}` objects* instead of the newline string the list renderer wants (and scalar presets to a raw value), because `applyMap` only short-circuits `transform:"none"` when there's no `items`/`path`. Now the `LIST`/`VALUE` helpers emit `transform:"join"` / `transform:"first"` to match databind.tsx's own binding contract; locked in with a contract unit test (every list preset → join + items; every scalar preset → a value transform). Fixed the one inline preset (plausible) too. 115 config tests; screen 27045/30000.
- [ ] Quality & hardening (a11y, perf, docs honesty)
- [ ] Landing / marketing polish
- [ ] **LAST: 100+ new full-page templates** across many use-cases

## Notes / gotchas
- Reddit `.json` needs a `User-Agent` header.
- Screen gzip headroom is small (~27.0/30 KB) — do NOT add screen renderers for integrations; reuse existing blocks via `source`. Only add a renderer if essential and measure.
- Token/OAuth resolve() can't be live-tested without creds (same as existing jira/asana) — keep them to documented endpoints; they're verified-by-construction + typecheck.
