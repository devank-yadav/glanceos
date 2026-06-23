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
- [ ] **B7 — OAuth scaffolds:** google-tasks, google-fit, youtube, microsoft-todo, microsoft-teams, dropbox, calendly, zoom, figma, discord, twitch, reddit-oauth, coinbase, monzo.
- [ ] **B8 — Per-integration preset objects (config registry):** each provider declares 1–3 ready-to-insert objects (block type + source kind + query template + map + props). Surface in Integrations page ("Add to a board") + slash menu group.
- [ ] **B9 — Integrations page polish:** catalog search, per-category sections, "objects" preview per integration, connected-status, empty states; aesthetic pass light+dark.
- [ ] **B10 — Server offline tests** for the keyless providers (registry.test) + docs/api + ADR + memory; tag a release.

## After integrations (priority order)
- [ ] Big feature (one deferred Studio direction — multi-page boards / version history / free-form zones)
- [ ] Studio polish + adversarial bug hunt
- [ ] Quality & hardening (a11y, perf, docs honesty)
- [ ] Landing / marketing polish
- [ ] **LAST: 100+ new full-page templates** across many use-cases

## Notes / gotchas
- Reddit `.json` needs a `User-Agent` header.
- Screen gzip headroom is small (~27.0/30 KB) — do NOT add screen renderers for integrations; reuse existing blocks via `source`. Only add a renderer if essential and measure.
- Token/OAuth resolve() can't be live-tested without creds (same as existing jira/asana) — keep them to documented endpoints; they're verified-by-construction + typecheck.
