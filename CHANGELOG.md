# Changelog

All notable changes to GlanceOS are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); GlanceOS is pre-1.0 and
ships from `main`, so minor versions can include features. Dates are the tag dates.

## [Unreleased] — launch hardening

Polishing toward a public, free launch:

- **Board version history & restore** — every meaningful save archives the prior
  document (throttled + pruned); a **History** panel in the Studio lists versions
  and restores any of them (restore is itself undoable).
- **Integrations grew to 137** server-side providers (keyless ones render with no
  login); the integration catalog is now generated from the registry so it can't
  drift. **70** one-click preset "objects".
- **Real brand artwork** for the Android TV / Tizen / webOS shells, an OpenGraph
  social card, GitHub links on the landing, and a README board-screenshot gallery
  rendered from the real runtime.
- **Repo hygiene**: this changelog plus `CONTRIBUTING.md`, `SECURITY.md`, and
  GitHub issue/PR templates.

## [9.7.0] — 2026-06-24 · Integrations: 121 data sources

Large expansion of what a board can pull from — dozens of new server-side
providers across many categories, each rendering through existing bindable blocks
at zero screen-runtime cost. Keyless sources work with no login; the rest paste a
token or sign in via OAuth.

## [9.0.0 – 9.6.0] — 2026-06-23/24 · Studio editor

A sustained pass making the Studio edit in place like a real design tool: edit
(almost) every object directly on the board; designable objects (padding, border,
radius, background, size); object presets and calm drag; drag-select marquee,
multi-select align/duplicate/delete, ⌘A; draggable Options/Data panels, ⌥-drag to
duplicate, right-click menus; corner-resize, recents in the slash menu, drag-to-
reorder list rows; keyboard resize (⌥+arrows), equalize columns, in-list ⌘D/⌘⌫.

## [8.0.0 – 8.2.0] — 2026-06-23 · Edit it like you mean it

In-place text editing, resize grips, a PowerPoint-style Layout picker, and content
rotation (deck/spotlight).

## [7.0.0] — 2026-06-22 · Knows your day

The pivot to a calm, private, context-aware productivity wall: render isolation,
a multi-arch container image + `docker compose up -d`, calendar/trend recipes,
focus-now / leave-by glance blocks, sustained/stale conditions, and a real-runtime
landing hero.

## [6.0.0 – 6.1.1] — 2026-06-22 · Calm at rest + effortless automations

Calm crossfade renderer, board Looks with auto day/night + quiet hours, the sensing
substrate (cooldown, trend, calendar context), share OG unfurl, e-ink ETag/304 +
adaptive refresh, battery forecast, pick-a-vibe onboarding, smart automation pickers
and the recipe gallery, and modern location.

## [5.0.0] — 2026-06-22 · Smart substrate

Sun/weather/presence sensing + fusion objects; travel-time, mail and health sources;
time/place/home/comms/self objects including the "My Day" digest.

## [4.0 – 4.7] — 2026-06-21 · Simpler, named, automated

Calm shell + landing, unified "Screens", a settings home, named objects,
Shortcuts-style automations in the Studio, and a full-page template gallery.

## [3.0.0] — earlier · Sharing, API, reactive, mobile

Lightweight board sharing, scoped API keys, a reactive automation/condition engine
with webhook inlets and live alerts, and a phone-first PWA.

## [2.0 – 2.2] — 2026-06-21 · Platforms & polish

TV / signage / native device shells, a pluggable hub backend with opt-in Redis, a
bespoke monochrome icon set, and a dashboard/Studio overhaul.

## [1.0 – 1.9] — earlier · Foundations

The core: the zod board contract, the tiny screen runtime, the Studio editor, live
data fetchers, e-ink 1-bit rendering with a documented device protocol, single-
password auth, display groups, and the self-host story.

[Unreleased]: https://github.com/devank-yadav/glanceos/compare/v9.7.0...HEAD
[9.7.0]: https://github.com/devank-yadav/glanceos/releases/tag/v9.7.0
