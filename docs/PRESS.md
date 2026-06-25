# GlanceOS — Press & media kit

A one-page fact sheet for anyone writing about, posting, or sharing GlanceOS.
Everything here is accurate to the current build; numbers are checked against the
code. Copy freely.

## One-liner

> **GlanceOS turns any screen into a calm, glanceable dashboard you compose like a document — free, open source, and self-hosted.**

## Short description (≈ 40 words)

GlanceOS is a free, open-source, self-hosted dashboard for any screen — a TV,
an old tablet, an e-ink panel, or a browser tab. Compose boards like a document,
bind live data from 165 keyless and connected sources, and run it on your own
server. No subscription, no telemetry.

## Long description (≈ 90 words)

GlanceOS is an open platform (MIT) that turns spare screens into calm,
glanceable dashboards. You build boards in a Notion-style editor from 213 block
types — clocks, weather, lists, stats, gauges, countdowns, signage — and any
block can be made *live*, pulling from 165 server-side integrations (over half
need no login at all) or any public URL. Boards stream to connected screens over
SSE and render through a sub-30 KB runtime, so they work on old smart-TVs and
battery e-ink panels alike. It's self-hosted in one container: your data never
leaves your server. Every feature is free.

## Key facts

| | |
| --- | --- |
| **License** | MIT (open source) |
| **Price** | Free — every feature, no subscription, no paywalls |
| **Hosting** | Self-hosted; one container (`docker compose up -d`), multi-arch image (amd64 + arm64) |
| **Privacy** | Your data stays on your server; no telemetry, no phone-home |
| **Blocks** | 213 block types |
| **Templates** | 159 ready-made full-screen boards (incl. zero-setup live ones) |
| **Integrations** | 165 server-side data sources (~96 keyless / no login) |
| **Preset objects** | 96 one-click pre-bound blocks |
| **Screens** | Any browser — TV, tablet, monitor, e-ink, Raspberry Pi; native shells for Android TV/Fire TV, Tizen, webOS, tvOS |
| **Runtime size** | Screen runtime ≤ 30 KB gzipped (CI-gated) |
| **Stack** | TypeScript monorepo — Hono + SQLite server, Preact config app, zero-dependency vanilla-TS screen runtime |

## Who it's for

Individual knowledge workers and homes who want a quiet, private status wall — and
self-hosters / small teams who'd rather own their dashboards than rent a screen in
someone's cloud. See the honest comparison on the landing page's "How it's
different" section.

## Links

- **Repository:** https://github.com/devank-yadav/glanceos
- **Run it:** [README — Quick start](../README.md) · one container, `docker compose up -d`
- **What it looks like:** [README gallery](../README.md#what-it-looks-like)
- **Platform support (honest tiers):** [docs/PLATFORMS.md](PLATFORMS.md)
- **Integrations catalog:** [docs/INTEGRATIONS.md](INTEGRATIONS.md)
- **Launch posts & checklist:** [docs/LAUNCH.md](LAUNCH.md)
- **Architecture:** [docs/ARCHITECTURE.md](ARCHITECTURE.md)

## Assets

Logos and screenshots in this repo, free to use when writing about GlanceOS:

- **Social card** (1200×630): [`apps/config/public/og.png`](../apps/config/public/og.png)
- **App mark** (SVG, monochrome): [`apps/config/public/icon.svg`](../apps/config/public/icon.svg)
- **Board screenshots** (real runtime, light + dark): [`docs/images/`](images/) — 8 boards (`board-*.png`)

The brand is intentionally monochrome (`#191919` ground, `#fafafa` mark). Please
don't recolour the mark or imply an endorsement.

## A note on "free"

GlanceOS launches **fully free** — every feature, for everyone, self-hosted. A
paid hosted tier may come later, but it is undecided and **nothing is paywalled
today**. If you're quoting pricing: it's free and open source.
