# Launch kit

Ready-to-edit copy + a launch-day checklist for shipping GlanceOS as a **free,
open-source** project. Everything here is a draft — tweak voice, fill the `<…>`
placeholders, and **verify every number against the repo the day you post**
(they drift): today it's **213 block types · 153 starter templates · 109
integrations · 47 one-click objects**, MIT, one-container self-host.

Positioning in one line: **GlanceOS turns any screen — a TV, an old tablet, a Pi
— into a calm, glanceable dashboard you compose like a document. Free, open
source, self-hosted. No subscription, no cloud, your data stays yours.**

---

## Show HN

**Title:** `Show HN: GlanceOS – Turn any screen into a calm dashboard (open source, self-hosted)`

**Body:**
> I built GlanceOS because the good dashboard-wall products (DAKboard, TRMNL) are
> subscription + cloud, and the DIY route (MagicMirror) is a weekend of YAML. I
> wanted something you self-host in one container and *compose like a Notion doc*.
>
> You point any browser — a TV, a spare monitor, an old tablet, a Raspberry Pi —
> at your server; it shows a short code; you claim it from your phone and start
> dragging blocks. 213 block types (clocks, weather, calendars, charts, gauges,
> countdowns, transit, signage…), 153 ready-made full-screen templates across 27
> use-cases (home, gym, classroom, café, clinic, office…), and 109 integrations
> (many keyless — Hacker News, weather, crypto, ISS, calendars, RSS…) you bind to
> a block with one click.
>
> It's **free and all features are free** — `docker compose up -d`, MIT licensed,
> no account with anyone, no telemetry. The screen runtime is a <30 KB framework-
> free bundle so it runs on cheap/old hardware and e-ink. Native shells for
> Android TV / Fire TV, Apple TV, Samsung (Tizen), LG (webOS), and Pi just load
> that runtime full-screen.
>
> Repo: <https://github.com/devank-yadav/glanceos>  ·  Demo: <DEMO_URL or "self-host in 2 min, README has it">
>
> Happy to answer anything about the architecture (Hono + SQLite + SSE, an SSRF-
> guarded fetch layer for the integrations, a zod-typed board schema shared across
> server/editor/runtime).

**First comment (post yourself, immediately):** a 3–4 sentence "why / how it
works / what's next" + the honest caveats (premium tier undecided; Apple TV /
Samsung / LG builds are sideload-from-source for now; e-ink firmware is on the
roadmap). HN rewards candor.

---

## r/selfhosted

**Title:** `GlanceOS — self-hosted, open-source dashboard wall for any screen (one container, no subscription)`

**Body:** lead with the screenshot/GIF, then:
> - **One container.** `docker compose up -d` (multi-arch image, runs on a Pi). One SQLite file is all your data.
> - **Free, MIT, no cloud.** Every feature free; no account with anyone, no telemetry. Premium tier is undecided — the open-source app is the product.
> - **Compose like a doc.** 213 blocks, 153 full-screen templates, drag/drop Studio with a live preview that *is* the real renderer.
> - **109 integrations**, many keyless so they work with zero setup; tokens are encrypted at rest.
> - **Any screen:** TVs, tablets, monitors, e-ink, + native shells (Android TV/Fire TV, Apple TV, Tizen, webOS, Pi).
> - **Self-host friendly:** reverse-proxy ready, `/health`+`/ready`, backups (`docs/BACKUP.md`), deploy configs for Fly/Render (`docs/DEPLOY.md`).
>
> GitHub: <link>. Feedback very welcome — especially what integration or block you'd want next.

(r/selfhosted likes specifics + honesty about limitations. Mention the SSRF guard
and "no telemetry" — that crowd cares.)

---

## Product Hunt

- **Name:** GlanceOS
- **Tagline (≤60 chars):** `Turn any screen into a calm, self-hosted dashboard`
- **Description:** `GlanceOS is a free, open-source, self-hosted dashboard wall. Compose boards like a document from 213 blocks and 153 templates, bind 109 integrations with one click, and run them on any TV, tablet, monitor, e-ink panel, or Raspberry Pi — one container, no subscription, your data stays yours.`
- **Topics:** Open Source, Self-Hosted, Productivity, Smart Home, Developer Tools
- **First comment:** the maker story (the DAKboard/MagicMirror gap) + a clear "free, premium maybe later, here's how to self-host in 2 minutes."

---

## Launch-day checklist

**T-minus (before posting):**
- [ ] **Cut a release tag** (`git tag vX.Y.Z && git push --tags`) so CI publishes the multi-arch image *and* `release.yml` attaches the **Android APK** to a GitHub Release. Confirm the Release page actually has the APK + checksum.
- [ ] **Dry-run the README as a stranger:** on a clean machine, follow the README top-to-bottom and time it — goal is a working instance in **<30 min** (ideally <5 with Compose). Fix anything that trips you.
- [ ] **Verify the headline numbers** in README/landing match the code that day (blocks/templates/integrations). They're easy to leave stale.
- [ ] **Visual kit ready** (NEEDS-YOU / Track D1): a 10-second demo GIF + 4–6 hero board screenshots embedded at the top of the README, and an OG/Twitter card on the landing so the link unfurls. *This is the single biggest conversion lever — don't launch the visual-first channels (PH/Reddit) without it.*
- [ ] **Hosted demo** (optional but strong): deploy a read-only instance (`docs/DEPLOY.md`), set `GLANCEOS_PUBLIC_URL`, `GLANCEOS_REGISTRATION=closed`, seed a demo board. Put the URL in every post.
- [ ] **Repo hygiene** (Track A6): `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` present; issues enabled; a couple of "good first issue"s.

**Posting:**
- [ ] Post **Show HN** in the morning (US ET, weekday). Add the first comment immediately. Don't ask for upvotes.
- [ ] Cross-post to **r/selfhosted** (read their self-promo rules first) and **r/homelab** if it fits.
- [ ] Submit to **Product Hunt** (schedule 12:01 AM PT). Line up the first comment.
- [ ] Optionally: lobste.rs (if you have an invite), the Self-Hosted podcast/newsletter, awesome-selfhosted PR.

**During / after:**
- [ ] Watch GitHub issues + the threads; reply fast and honestly.
- [ ] Triage feature requests into the roadmap; thank contributors.
- [ ] Keep `main` green — a broken `docker compose up` on launch day is the worst outcome.

---

## Honest "what to say if asked"
- **Is it really free?** Yes — every feature, no subscription, MIT. A managed/premium tier may come later; nothing is gated today.
- **Multi-user/teams?** Multi-user on one instance, yes; it's a single trust domain (not hardened multi-tenant SaaS).
- **All platforms shipping?** Web/PWA + Android TV (downloadable APK) are turnkey; Apple TV / Tizen / webOS build from source (vendor accounts needed to sideload/submit); Pi is an installer; e-ink firmware is on the roadmap. Or point any smart-TV browser at `/screen/?tv=1`.
