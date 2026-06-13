# Roadmap

Build-to-learn: every phase pairs skills (tracks from [LEARNING-PATH.md](LEARNING-PATH.md)) with a shipped artifact and explicit exit criteria. A phase is done when its exit criteria are demonstrably true, not when it feels done.

**The honest total, said out loud:** ≈ **275–385 focused hours**. At 7–15 hours/week that is **6–13 months**. Knowing this up front is the antidote to quitting at month 3 — the schedule is long because the learning is the point.

Two standing rules:

- **No hardware purchases before P3, no e-ink hardware before P5.** Each phase has a ₹ cap.
- **A new idea must name the phase item it displaces.** Otherwise it goes to the [icebox](#icebox).

| Phase | Artifact | Tracks | Hours | ₹ cap |
|---|---|---|---|---|
| P0 | Orientation + this repo | F | ~10 | 0 |
| P1 | TS foundations via 4 mini-builds | A, C | 25–35 | 0 |
| P2 | Platform v0.1 in any browser | A, C, D | 80–110 | 0 |
| P3 | Bootable Pi kiosk image | B, C | 40–60 | ~7,000 |
| P4 | Integrations + template gallery | D | 40–60 | 0 |
| P5 | E-ink runtime + buttons | D, E | 50–70 | ~8,000 |
| P6 | Open-source launch | F | 30–40 | 0 |

---

## P0 — Orient *(hard timebox: 1 week)*

**Ships:** this repo; prior-art teardown folded into the README comparison table; seeded [DECISIONS.md](DECISIONS.md).

**Do:** actually install and poke MagicMirror² and Anthias for an hour each; read TRMNL's docs and FullPageOS's image-build setup; sharpen the README wedge if anything rings false.

**Exit criteria:**
- [ ] One outside person reads the README comparison and calls it fair
- [ ] Tool versions verified current (Node LTS, pnpm, zod major) and DECISIONS updated if drifted
- [ ] Zero rupees spent

## P1 — TypeScript foundations *(Tracks A, C)*

**Status: reworked by [DECISIONS 014](DECISIONS.md)** — v0.1 was built first, so these mini-builds become rebuild-exercises against live code (see the mode note in LEARNING-PATH). The exit criteria below still gate calling P1 done.

**Ships:** four mini-builds, all landing in repo `exercises/` dirs — A1 Flask→Hono port, A2 vanilla clock widget, A3 schema typed by hand then by zod, C1 SSE in 30 lines.

**Exit criteria:**
- [ ] Can build a typed fetch-and-render page without a tutorial open
- [ ] Can explain ESM vs CJS and the event loop to a rubber duck without notes
- [ ] All four exercises committed with journal notes

## P2 — Platform v0.1 *(Tracks A, C, D — the long phase; split it)*

**Status: v0.2 shipped (2026-06-12).** v0.1 (same day) proved the spine: claim codes → SSE → live dashboard, password auth, ICS recurrence, CI, Dockerfile. v0.2 rebuilt the config app into the product: **multi-user accounts** ([018](DECISIONS.md)) with migration 003 carrying v0.1 installs over as `admin@local`; the **Studio** — drag-drop editing on a live preview that is the real screen runtime in an iframe, Notion-style `/` menu, ten block types (heading/divider/image/callout joined), gesture-based undo, debounced autosave ([020](DECISIONS.md)); **setups decoupled from screens** (disconnect keeps the board; one board → many screens); and the **template hub** — publish/browse/search/import across all accounts on the instance ([019](DECISIONS.md)). **43 tests** including multi-user isolation and the real migration upgrade path. **Left before calling P2 done:** demo on a real TV browser. **Known gaps, tracked:** ICS TZID treated as server-local time; no email verification/password reset ([018](DECISIONS.md)); rate limiting/moderation deferred ([019](DECISIONS.md)).

**P2a — server core:** Hono app; SQLite + migration runner; device register/claim; layout CRUD validated by `packages/schema`; SSE hub.
**P2b — screen runtime + widgets:** vanilla TS runtime with `mount/update/destroy` widget interface; clock, ICS calendar, weather (Open-Meteo, keyless), tasks (server-local), text, queue; claim-code screen; cached-state offline behavior.
**P2c — config app:** Preact; login, claim flow, form-based layout editor with inline zod errors; served by the server in production build.

**Exit criteria:**
- [ ] Fresh clone → `pnpm i` → `pnpm dev` works, documented in README
- [ ] A second browser tab registers as a "device", shows a claim code, gets claimed, renders a layout
- [ ] Editing a layout updates the screen in under 2 seconds
- [ ] Demoed on one real TV browser (the conservative-build-target proof)
- [ ] Kill the server mid-demo: screen keeps showing cached state, recovers on restart

## P3 — Pi kiosk image *(Tracks B, C — "the OS" phase)* — ₹ cap ~7,000

**Ships:** `devices/pi-image`: manual kiosk runbook (B1) → pi-gen stage reproducing it → read-only rootfs → AP-mode first-boot Wi-Fi provisioning. The claim code is rendered by the screen app itself; the Pi stays dumb.

**Buy now, not earlier:** Raspberry Pi Zero 2 W (or Pi 4 if found cheap) + 2 SD cards + a known-good PSU.

**Exit criteria:**
- [ ] Power-on → AP appears → phone joins, enters home Wi-Fi → screen shows claim code → claim → dashboard, no keyboard ever attached
- [ ] Survives 10 consecutive power-pulls without filesystem damage
- [ ] A `.img` built by pi-gen in one command, flashed with Raspberry Pi Imager

## P4 — Integrations + templates *(Track D)*

**Ships:** Google Calendar via OAuth (auth-code + refresh); Home Assistant status widgets over its WebSocket API; template gallery seeded by the three golden layouts — personal, clinic queue (with the operator "+1" phone page), home status.

**Exit criteria:**
- [ ] Each template installable on a fresh device in under 1 minute
- [ ] An HA light toggled elsewhere updates on the dashboard live
- [ ] Google token refresh survives a server restart (tokens persisted, not in-memory)

## P5 — E-ink runtime *(Tracks D, E)* — ₹ cap ~8,000

**Status: render pipeline + device protocol shipped (v0.7, [DECISIONS 026](DECISIONS.md)).** The server renders the live board to a 1-bit BMP / `raw1` / grayscale PNG via Playwright → sharp → hand-written Floyd–Steinberg (hardware-free; doubles as a dashboard-screenshot feature). The BYOS device protocol ([DEVICE-API.md](DEVICE-API.md)) — register → poll `/display` → fetch image → deep-sleep — is ready for firmware, with battery/signal telemetry and a fleet dashboard. Playlists and the polling-URL plugin block landed too. **Still to do:** real ESP32 firmware against the protocol, partial-refresh, and 2 buttons → server events → HA.

**Buy now:** ESP32 devkit (~₹500) + Waveshare SPI e-paper — 4.2" (~₹3,000) to learn on; 7.5" once it works. *(The Alibaba 6" 758×1024 panels are e-reader replacement parts needing an IT8951 driver board — logged as a v2 BOM question in ARCHITECTURE §12, not a learning vehicle.)*

**Exit criteria:**
- [ ] Battery device updates every 15 min and the measured average current is written down honestly
- [ ] Button press → light toggles → next refresh shows new state
- [ ] The same layout looks intentional on both a TV and the e-paper panel (device profiles doing their job)

## P6 — Open-source launch *(Track F)*

**Ships:** CI building `.img.xz` releases (pi-gen docker mode) and a Docker image on GHCR; Astro Starlight docs site; a demo GIF that explains the product in 10 seconds; launch posts (Show HN, r/selfhosted, r/raspberry_pi); CONTRIBUTING.md (now it's earned).

**Exit criteria:**
- [ ] One recruited stranger self-hosts from the README alone in under 30 minutes, while I watch and say nothing
- [ ] Release artifacts produced by CI, not by hand
- [ ] "Success" metric written down: 10 strangers self-hosting beats 1,000 stars

---

## Icebox

Ideas with a pulse, parked on purpose. Promotion requires naming what they displace.

- Custom HDMI-stick hardware (CM4 / x86 stick) — Pi-class boards are the form factor until the platform earns better
- Cross-instance hub federation (a global template registry across deployments)
- Studio multi-select, copy/paste between setups, collaborative editing
- Native TV apps (Android/Tizen/webOS) — the TV's browser is the TV story
- OTA A/B updates (RAUC/Mender) — matters when strangers run fleets, not before
- Color e-ink, color themes
- Widget plugin API for out-of-tree widgets
- Voice anything (see Non-goals — likely never)
