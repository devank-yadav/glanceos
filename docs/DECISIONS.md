# Decisions

ADR-lite log. Every pinned choice gets an entry **when it's made** — context, the call, why, and what would reopen it. Newest at the bottom. The habit matters more than the format.

---

### 001 — Appliance platform, not a kernel
- **Status:** accepted · 2026-06-12
- **Context:** "An OS for every screen" could mean distro/kernel work or a platform + thin runtimes.
- **Decision:** Server as single source of truth + stateless screen runtimes; the Pi image is packaging, not an OS project.
- **Why:** It's what makes zero-on-device-settings natural; it's the shape every credible product here converges on; kernel work teaches the wrong skills for this product.
- **Revisit when:** never for v1. (A custom image ≠ a custom OS.)

### 002 — TypeScript everywhere
- **Status:** accepted · 2026-06-12
- **Context:** Background is Python (Flask/Django); the doc draft floated Node or Flask.
- **Decision:** TS for server, screen runtime, config UI, and tooling.
- **Why:** The screen runtime is web tech no matter what; one language halves the surface to stay fluent in; learning modern TS properly is an explicit goal, not a tax.
- **Revisit when:** never for v1. (Track B/E exceptions: Python allowed in Pi provisioning spikes, C++ on the MCU.)

### 003 — Hono on Node 24
- **Status:** accepted · 2026-06-12
- **Context:** Server framework: Express, Fastify, Hono, or Next.js-for-everything.
- **Decision:** Hono + `@hono/node-server`, `tsx` for dev.
- **Why:** Tiny and readable; TS-inference-first; Web-standard Request/Response (knowledge transfers to Workers/Bun/Deno); built-in SSE helper. Express teaches 2015 callback patterns; Fastify's plugin system is its own curriculum; Next.js is the wrong shape for a stateful SSE daemon with background jobs and hides the server learning.
- **Revisit when:** the server needs something Hono's middleware ecosystem genuinely lacks.

### 004 — SQLite via better-sqlite3, raw SQL, numbered migrations
- **Status:** accepted · 2026-06-12
- **Context:** Storage for devices, layouts, tasks, tokens. ORMs (Drizzle/Prisma) are the default reflex.
- **Decision:** better-sqlite3, hand-written SQL, a hand-rolled migration runner over `migrations/00X_*.sql`.
- **Why:** I already know SQL — leverage it; the synchronous API removes async noise while async itself is still new; a single-writer appliance is SQLite's home turf; writing the migration runner once is a better teacher than any ORM doc.
- **Revisit when:** P4, if query-building pain is real — Drizzle is the candidate; log the pain first.

### 005 — zod v4 in `packages/schema` is the single source of types
- **Status:** accepted · 2026-06-12
- **Context:** TS types are erased at runtime; layouts arrive as untrusted JSON from the network.
- **Decision:** Every shared shape is a zod schema; TS types come from `z.infer`; JSON Schema for firmware/docs via `z.toJSONSchema()`.
- **Why:** One definition validates at the boundary *and* types the code; the schema-as-contract rule (ARCHITECTURE §3) needs a single enforcement point.
- **Revisit when:** schema compile-time cost or bundle size on the screen runtime becomes measurable.

### 006 — SSE only for pushing to screens; battery devices poll
- **Status:** accepted · 2026-06-12
- **Context:** Push channel: WebSockets, SSE, or polling.
- **Decision:** SSE for live screens; ETag/`If-None-Match` polling for e-ink; no WebSocket server. The only WebSocket is outbound to Home Assistant (its native API).
- **Why:** Dumb glass needs one direction; `EventSource` gives reconnect + `Last-Event-ID` for free; plain HTTP keeps old TV browsers and proxies happy; push is meaningless to a device that's asleep 99% of the time. Device→server messages (buttons) are plain POSTs.
- **Revisit when:** a real feature needs low-latency device→server streaming (none planned).

### 007 — Screen runtime is vanilla TS + Vite, no framework
- **Status:** accepted · 2026-06-12
- **Context:** The runtime must run on old smart-TV browsers and stay tiny.
- **Decision:** No framework. A hand-rolled `mount / update / destroy` widget interface; conservative Vite build target.
- **Why:** The render model is trivial (state document in → DOM out); payload size and browser compatibility are the real constraints; designing the micro widget API myself is the Track A capstone, not an inconvenience.
- **Revisit when:** widget count or interactivity outgrows it — and even then, Preact, not React.

### 008 — Config UI is Preact
- **Status:** accepted · 2026-06-12
- **Context:** The editor is a real app (forms, state, routing-ish) — the one place a component model pays.
- **Decision:** Preact with plain hooks.
- **Why:** Component thinking is the genuinely new concept worth learning with a library; React-compatible API so the skill transfers 1:1, at ~4 kB; building a forms app in vanilla DOM would teach that frontend is misery, which is the wrong lesson.
- **Revisit when:** never for v1.

### 009 — pnpm workspaces only; no turbo/nx
- **Status:** accepted · 2026-06-12
- **Context:** Monorepo tooling enthusiasm is a known trap.
- **Decision:** pnpm workspaces, root scripts, nothing else. `devices/` is deliberately outside the workspace (non-TS toolchains).
- **Why:** Three packages and one developer have no build-cache problem; every tool added now is learning budget spent off-mission.
- **Revisit when:** >5 packages or CI minutes actually hurt.

### 010 — MIT license
- **Status:** accepted · 2026-06-12
- **Context:** MIT vs Apache-2.0 vs AGPL (the classic protect-the-server instinct).
- **Decision:** MIT, whole repo.
- **Why:** The wedge against TRMNL/DAKboard is "actually open" — maximize adoption and forkability while the moat is community, not code; AGPL would chill the embedded/firmware crowd to defend against a SaaS-capture threat a v0.1 learning project doesn't face; Apache's patent grant adds friction with no current benefit.
- **Revisit when:** a hosted service of mine is imminent (then per-component licensing, decided in the open).

### 011 — pi-gen for image building
- **Status:** accepted · 2026-06-12
- **Context:** Pi image tooling: pi-gen, rpi-image-gen (newer official tool), Buildroot, Yocto.
- **Decision:** pi-gen (docker mode), as a custom stage on Raspberry Pi OS Lite.
- **Why:** It's how Raspberry Pi OS itself is built — boring and documented; stages map exactly onto "my manual runbook, automated"; Buildroot/Yocto teach embedded-distro engineering this product doesn't need yet.
- **Revisit when:** P3 starts — check rpi-image-gen maturity then; or if image size/boot time ever becomes the product problem.

### 012 — Screens never talk to third parties
- **Status:** accepted · 2026-06-12
- **Context:** Widgets need weather/calendar/HA data; the obvious shortcut is fetching from the client.
- **Decision:** All external data is fetched server-side; devices receive a complete screen-state document.
- **Why:** No API keys on devices; no CORS; ten screens share one cached upstream call; the e-ink renderer consumes the identical state, so e-paper output can never drift from the live screen.
- **Revisit when:** never for v1 — this one is load-bearing.

### 013 — No hardware purchases before P3; no e-ink before P5
- **Status:** accepted · 2026-06-12
- **Context:** Alibaba tabs were already open (6" e-reader panels, HDMI sticks) before a line of code existed.
- **Decision:** ₹0 through P2. P3 ≈ ₹7k (Pi + SD). P5 ≈ ₹8k (ESP32 + Waveshare SPI panel). Per-phase caps live in ROADMAP.
- **Why:** The browser runtime proves the product on screens already owned; hardware bought early becomes guilt, not momentum; the 6" 758×1024 panels need an IT8951 driver detour (v2 BOM question), and Android HDMI sticks are locked-bootloader dead ends for a custom Linux image.
- **Revisit when:** each phase boundary, by design.

### 014 — Build v0.1 first, learn by extending
- **Status:** accepted · 2026-06-12
- **Context:** The original plan was learn-then-build: P1 exercises before any platform code. Priorities flipped — have the working system now, study against it.
- **Decision:** Platform v0.1 (schema, server, screen, config) was built in one pass. LEARNING-PATH pivots from "write each piece from scratch" to "read → trace → modify → rebuild" against real code.
- **Why:** A working reference makes every later phase concrete, and rebuilding a module you can diff against is often a better exercise than a blank page. The curriculum content survives unchanged.
- **Revisit when:** never — but every module rebuilt as an exercise gets a journal note.

### 015 — No auth in v0.1-alpha
- **Status:** superseded by 016 · 2026-06-12
- **Context:** P2c planned single-user password auth; v0.1-alpha ships without any.
- **Decision:** Config endpoints are open on the LAN. Device endpoints still require deviceId + secret.
- **Why:** A session layer before the core loop proved itself was scope, not safety — on a single-machine dev setup the risk is bounded, and it's documented loudly.
- **Revisit when:** BEFORE any exposure beyond localhost/trusted LAN, and no later than P3 — a Pi on the network makes this real. *(Revisited same day: 016 shipped it.)*

### 016 — Password auth: Node scrypt + DB sessions
- **Status:** accepted · 2026-06-12
- **Context:** 015's debt came due the moment the MVP became deployable. Track C planned argon2.
- **Decision:** Single config-plane password. First visit sets it; `scryptSync` from `node:crypto` hashes it; opaque session tokens live in SQLite behind an httpOnly cookie. The device plane (register / me / stream) stays on deviceId+secret and never needs the password.
- **Why:** For one household password, the stdlib KDF beats carrying a native dependency — scrypt is memory-hard and built in. Sessions in the DB survive restarts and are revocable (logout deletes the row). argon2 remains the documented upgrade path if multi-user ever lands.
- **Revisit when:** multi-user, or any hosted/multi-tenant story (both icebox).

### 017 — Take the rrule dependency for ICS recurrence
- **Status:** accepted · 2026-06-12
- **Context:** The hand-written ICS parser showed recurring events only once — a real gap for the core "my classes on my wall" use case. LEARNING-PATH Track D planned exactly this buy-vs-build moment.
- **Decision:** Keep the hand-written VEVENT parser (it's the learning artifact), but hand `RRULE:` lines to the `rrule` package and expand occurrences inside the 14-day glance window.
- **Why:** RFC 5545 recurrence is a notorious edge-case swamp (UNTIL, COUNT, BYDAY, leap years); reimplementing it teaches little beyond pain. One battle-tested dependency, scoped to one line of the format. Bonus lesson, learned live: rrule ships dual CJS/ESM builds and Node vs Vite load different ones — the interop shim in `fetchers/ics.ts` is the ESM/CJS confusion from Track A, met in the wild.
- **Revisit when:** TZID-aware recurrence (P4) — may need the tz-aware rrule setup or a different library.

### 018 — Multi-user accounts
- **Status:** accepted · 2026-06-12 · supersedes 016
- **Context:** The config app became the product's face (login → screens → studio) and the hub needs authorship. Single-password auth had no notion of "whose screen".
- **Decision:** Users table (name, email case-insensitive-unique, scrypt hash); sessions carry user_id; devices, setups, tasks, and queues are owned rows; every config-plane route scopes to the session user and cross-user access is a plain 404. Claiming binds the device to the claiming account. Registration is open by default, closable with `GLANCEOS_REGISTRATION=closed` — except the first account, which is always allowed (a closed fresh deploy must be enterable). Password minimum is 8 on the new surface. Migration 003 turns a legacy single-password install into the `admin@local` account with everything attached.
- **Why:** "Screens connected to *the account*" and "users share *their* templates" both require identity. The device plane (id+secret, SSE) is deliberately untouched — screens never know about users.
- **Revisit when:** email verification / password reset (known gap — fine on LAN, required before a public deploy is advertised); roles/admin.

### 019 — The instance IS the template hub
- **Status:** accepted · 2026-06-12 · amends the old multi-tenant non-goal
- **Context:** Users want to share templates and import others'. A global cross-deployment hub means running a registry service.
- **Decision:** Publishing is a flag on a setup; the hub is a server-local query across all users' published setups plus the GlanceOS builtins (is_template=1, user_id NULL — unownable, hence uneditable). Import copies the document into your account and bumps import_count. One public deployment of GlanceOS therefore *is* a hosted hub; federation across instances stays out of scope.
- **Why:** Delivers real sharing with zero new infrastructure; authorship and counts come from tables that already exist. Abuse posture for public deploys: registration valve (018), zod length caps on name/description, widget text via textContent, image URLs protocol-locked — rate limiting and moderation are explicitly deferred.
- **Revisit when:** a cross-instance hub/registry is genuinely wanted (it would consume this same publish/import shape).

### 020 — The Studio: drag-drop editing on the real renderer
- **Status:** accepted · 2026-06-12 · promotes the icebox item ADR 007 deferred
- **Context:** v0.1 shipped form-based editing and parked drag-drop. The product call: editing should feel like Notion — palette, drag, resize, "/" insert menu.
- **Decision:** The studio's preview is the actual screen runtime in an iframe (`?preview=1`, postMessage) — the config app still never renders widgets, so preview and glass can't drift. Drag/resize/insert are hand-rolled pointer events on an overlay that owns all input (no dnd library, no react-compat); one pure geometry module mirrors the runtime's grid math and is unit-tested. History is gesture-based: a whole drag — or a typing burst — is exactly one undo step. Autosave debounces 1 s, never fires mid-gesture, validates with zod before PUT, and pushes live over the existing SSE. Two tabs editing one setup is last-write-wins, accepted and documented.
- **Why:** The iframe trick keeps "one schema, many renderers" honest; hand-rolled DnD is ~200 lines against a snapping grid, smaller than any library plus its compat shims; gesture history is what makes undo feel right.
- **Revisit when:** multi-select, copy/paste between setups, or collaborative cursors (all icebox).

### 021 — Document-flow layout model (schema v2): lines and columns, not a grid
- **Status:** accepted · 2026-06-12 · supersedes the v1 grid document
- **Context:** The product call: editing must feel exactly like Notion — blocks live on lines, you drag by a ⠿ handle, a drop line shows where things land, and dropping beside a block makes columns. A col/row/span grid can't express that feel; mid-drag live reflow made it sluggish.
- **Decision:** A board is `rows[]` (lines); each row holds 1–4 blocks (columns) with relative `width` weights. One fixed-glass adaptation: screens don't scroll, so lines share the screen height equally (divider-only lines stay thin) instead of growing like a document. Drags never touch the document — a drop-indicator line previews the target and the drop is ONE commit (also one undo step); ghost chip and indicator are ref-mutated DOM, so pointer moves re-render nothing. Column widths resize by dragging the gutter between blocks; side-drops reset a line to equal columns, exactly like Notion. v1 grid documents migrate on read (widgets grouped by grid row; colSpan becomes width; rowSpan dropped) — the "schemaVersion is bumped and old documents are migrated on read" promise from ARCHITECTURE, exercised for real.
- **Why:** Structure-as-data (lines/columns) is the right shape for both the Notion feel and dumb glass: the screen renders it with twelve lines of flexbox, and the editor's hit-testing reduces to pure math that's unit-tested. Killing mid-drag document updates removed every iframe re-render and preview-data call from the drag loop — that's the snap.
- **Revisit when:** per-line height weights, nested columns, or >4 columns are genuinely wanted.

### 022 — Row heights, a 46-block library, and a text-editor feel (schema v3)
- **Status:** accepted · 2026-06-12 · refines 021
- **Context:** v2 rows shared the screen height equally, so a single block filled the whole screen and there was no way to make something small. The product ask: feel like Notion — type to add text without inserting an object, blocks at natural sizes you can resize, the drag handle clear of the resize affordances, visible boundaries while dragging, and far more block types.
- **Decision:**
  - **Row heights.** A row carries `h` (units out of a 24-unit page). Rows flow from the top at their own height; the leftover is a blank trailing track, so a board *never* stretches to fill. Both axes are now resizable: drag a column seam (width weights) or a row's bottom seam (height units). The screen renders this as one CSS grid (`grid-template-rows` from the units + remainder); the editor's geometry mirrors it and is unit-tested.
  - **Inline text + type-to-create.** Double-click a text-ish block (or Enter on a selection) edits its text in place; on a single-line type, Enter commits and opens a fresh text line below. Double-clicking empty space inserts a text line there. The "object" is implicit — you just type.
  - **46 blocks.** 36 new types joined the original 10, grouped by category with palette search and the `/` menu: text/structure (subheading, quote, lists, checklist, code, key-value, table, banner, definition, label, spacer…), numbers (stat, metric, progress, gauge, rating), time (world clock, countdown, days-until, timer, date badge, week number, analog clock), nature (moon phase, sunrise/sunset — pure math, no network), identity (icon, avatar, badge, name tag), signage (hours, menu), and smart-home placeholders (device status, sensor, thermostat). The time/nature blocks compute on the screen from the local clock; none need a server fetcher, so `resolveWidgetData` is unchanged and the "screens never call third parties" rule holds.
  - **Handle vs resize.** The ⠿ drag handle moved to the block's top-centre, clear of the column/row seams it used to collide with. Boundaries: every block outlines faintly during a drag, the dragged one dims, and a translucent halo marks the target row — overlap is structurally impossible in document flow, so this is purely to make placement legible.
  - **Smoothness.** Blocks glide to new positions via CSS transitions (suppressed during live resize); the drop indicator, halo, and cursor chip are ref-mutated DOM, so a drag still triggers zero React re-renders.
- **Why:** Row heights are the honest fix for "don't fill the screen" on fixed glass; a unit grid keeps it resolution-independent and lets the renderer stay ~12 lines of CSS. Inlining the schema's `PAGE_UNITS` as a literal in the screen (rather than importing the value) keeps zod out of the screen bundle — it stayed ~6 kB gzipped despite 46 renderers.
- **Revisit when:** per-block min-heights, content-driven auto-height, or a block plugin API.

### 023 — One design system: monochrome liquid glass, and a fast-by-structure frontend
- **Status:** accepted · 2026-06-12
- **Context:** The app needed a public face (home page) and a consistent, polished frontend; the ask included "load crazy fast".
- **Decision:**
  - **Design language:** paper-white monochrome with a fixed gray "fog" backdrop; glass surfaces (`backdrop-filter` blur) for nav, sheets, menus, and the studio chrome; ink-black gradient buttons; one accent color (the indicator blue) reserved strictly for drop/focus affordances, never decoration. Landing page = monumental hero with a faint suspension-bridge SVG motif, a live mock board in a glass frame, feature cards, the real 46-block wall (rendered from the BLOCKS registry, so it can't drift), steps, CTA. System fonts only — zero font download.
  - **Speed as architecture, not vibes:** the Studio (and zod with it) is a lazy chunk — the shell that serves the landing/dashboard/hub dropped from 146 kB to **46 kB (16 kB gzip)**, with the 107 kB studio chunk prefetched on idle so opening a board is still instant. Server gzips every non-API response (`hono/compress`, explicitly never the SSE stream) and marks hashed `/assets/` immutable for a year, HTML no-cache. The setups page stopped importing zod (server validates imports anyway). Screen runtime untouched at ~6 kB gzip.
- **Why:** One stylesheet of tokens keeps every surface coherent the way Notion feels coherent; splitting on the editor boundary is the single highest-value cut because zod + editor logic dwarf everything else; compression + immutable caching make second loads near-free on any LAN.
- **Revisit when:** dark mode for the config app (screens already have it per-board), or a real font if the brand ever wants one.

### 024 — Live-data blocks, fetched server-side, keyless and graceful
- **Status:** accepted · 2026-06-13
- **Context:** The block library grew to 96; 16 of the new blocks show *live* data (weather forecast, wind, UV, air quality, rain; RSS headlines, Hacker News; currency, crypto; Wikipedia on-this-day & summaries; quote/fact of the day; GitHub stats; next public holiday; ISS position).
- **Decision:** Live data is fetched **server-side** in `resolveWidgetData` and streamed to screens in the screen-state document — never by the screen — upholding DECISIONS 012. Every source is **free and keyless** (Open-Meteo, Frankfurter, CoinGecko, Wikipedia REST, HN Firebase, GitHub public API, Nager.Date, Open-Notify, ZenQuotes, uselessfacts, plus any user-supplied RSS/Atom URL). A shared `fetchers/cache.ts` caches per input with sane TTLs (table in ROADMAP), de-dupes in-flight calls, sends a descriptive User-Agent, times out at 8 s, and **returns null on any failure** → the screen shows a calm one-line placeholder. Live blocks are kept out of fixtures, and one server test forces fetch failure to prove the whole suite/CI stays green offline.
- **Why:** Keeps the "screens are dumb glass, no third-party calls, no API keys on devices" guarantee while still delivering genuinely live boards; keyless sources mean self-hosters configure nothing. Per-input caching keeps every source far under its rate limit.
- **Revisit when:** a wanted source needs a key (then a per-user secrets store, the P4 integrations work) — explicitly out of scope here.

### 025 — Power-user editing: multi-select, clipboard, outline, present, zoom
- **Status:** accepted · 2026-06-13
- **Context:** With 96 blocks the Studio needed faster ways to arrange and reuse them.
- **Decision:** Ten additions, all on the existing reducer/geometry: **multi-select** (Shift-click; `selectedIds[]` with the last as primary) for group delete/duplicate/copy; **clipboard** via `localStorage` so blocks copy/cut/paste **across boards** (⌘C/X/V); **duplicate** (⌘D); an **outline/layers panel** (lines→blocks, click-select, per-line move/duplicate/delete); **row ops** (⌘⇧↑/↓ + outline buttons) via pure `moveRow`/`duplicateRow`/`deleteRow`; **per-block emphasis** — `style.invert` (black) + horizontal/vertical align, an optional defaulted field so v3 docs are unaffected; **board vertical alignment** (top/center/bottom via where the blank remainder track sits); **present mode** (full-screen real-runtime iframe, Esc to exit); **zoom** (Fit/50/75/100/125%, the stage scrolls when zoomed; the overlay already multiplies by scale); and a **shortcuts overlay** (`?`).
- **Why:** Each composes with what existed — the geometry stays pure and unit-tested, drags still cause zero React re-renders, and the schema additions are backward-compatible (no migration).
- **Revisit when:** marquee/box-select, group drag-move, or copy/paste of whole lines.

### 026 — The e-ink platform: server-rendered 1-bit images, a device protocol, playlists, polling plugins
- **Status:** accepted · 2026-06-13
- **Context:** To stand with (and past) dedicated e-ink dashboard products, GlanceOS needed the things they're known for — a real battery e-paper story — built our own way and kept open.
- **Decision:** Four additions, all server-side so screens stay dumb glass:
  - **Server render pipeline (P5 realized):** `render/` does headless Chromium screenshot (Playwright) of the *real* screen runtime at the panel resolution → grayscale (sharp) → hand-written Floyd–Steinberg dither → 1-bit **BMP** (or `raw1` packed framebuffer, or grayscale PNG preview). Because it photographs the actual renderer, an e-paper panel and a TV show the same board. The dither and BMP/raw1 encoders are pure and unit-tested; Playwright is the only heavy part and the endpoint returns `503` with install instructions if Chromium is absent, so CI stays light.
  - **BYOS device protocol** ([DEVICE-API.md](DEVICE-API.md)): a tiny documented contract — `register` once, then per wake `GET /display` (returns `image_url` + `refresh_rate`, records battery/RSSI/firmware from headers) and fetch `render.bmp`. Any firmware, any self-hosted server, no cloud. Deep-sleep guidance is the `refresh_rate` the owner sets per device.
  - **Playlists:** a screen rotates through several setups; the current item is chosen deterministically from the clock (`floor(now/interval) % n`) so SSE browsers and polled e-ink devices agree with zero coordination. `composeState` resolves the current layout; a 10 s server tick advances connected rotating screens.
  - **Polling-URL plugin** (`jsonFeed` block): point a block at any JSON URL; the server polls + caches it and renders a safe `{{dotted.path}}` template into display lines — turns any API into a calm tile with no code, no key. Pure interpolation, never eval.
  - **Fleet dashboard:** device cards show battery / signal / last-seen / resolution, a per-device refresh control, an inline 1-bit **e-ink preview**, and playlist assignment.
- **Why:** Reuses the existing "server is truth, dumb glass" spine (DECISIONS 001/012) and the live-fetch cache (024); the render pipeline was always the planned P5 endgame. Implemented entirely as our own code (standard algorithms from their specs, original API/UI), MIT-licensed and self-hostable.
- **Revisit when:** real ESP32 firmware (the protocol is ready), partial e-ink refresh, OTA image releases, or per-render diffing to skip unchanged panels.

### 027 — The Studio types like a document (and 139 blocks)
- **Status:** accepted · 2026-06-13
- **Context:** Editing should feel like opening a note, not assembling objects. The outline/layers panel was extra surface that fought that feel.
- **Decision:** A fresh board opens with a **heading on the first line, cursor focused** (Notion's "Untitled"). Typing flows as prose: in the prose block types (`ENTER_BREAKS` set — text, headings, quotes, etc.) **Enter starts a new text line below** and Shift+Enter inserts a literal newline; **Backspace on an empty line** deletes it and jumps the cursor to the line above. So you "type on the screen" — text is never an object you insert; `/` is only for non-text blocks. The **outline panel was removed** (its move/duplicate/delete live on the ⠿ handle, arrow keys, and ⌘⇧↑↓). Block library grew to **139** (+42: signature/address/legend/notice/key-combo; icon-row/stat-row/frame; line/area charts, bullet/horizontal-bars/ranking/waffle/signal/thermometer/comparison/percent; month-calendar/week-strip/now-next/age/anniversary/time-blocks/open-hours/pomodoro; month-habit/savings/reading/weight/mood/checklist-%; room-status/directory/event/open-sign/now-playing/split-flap), all computed or prop-only.
- **Why:** The whole point is "calm document, not a form." Reusing the existing row/block model (a heading is just the first row; a paragraph is a text block) means no new data shape — the document-flow schema already expresses it.
- **Revisit when:** rich-text within a block, slash-inside-a-line, or drag-to-reorder paragraphs by gutter.

### 028 — Type by clicking (single-click edit) and 199 blocks
- **Status:** accepted · 2026-06-13
- **Context:** ADR 027 made a *fresh* board open in edit mode, but on an existing board a single click only *selected* a block and the global key handler ignored printable keys — so clicking a text block and typing did nothing. That read as "the screen isn't a text editor."
- **Decision:** A **single click on a text block now enters edit mode** (cursor placed at the end, not select-all), and a **printable key with a text block selected starts typing** (so even `p`/`?`, which are global shortcuts otherwise, type into text rather than firing). On a blank board a printable key births a text line. Double-click still works. The block library grew to **199** (+60, all computed or prop-only, zero new fetchers — schema stays v3): epigraph/kicker/ticker/glossary/footnotes/highlight/letterhead/field/contents/aside/postscript/mantra; emoji-stat/monogram/flag/logo-text/profile/people; big-number/percent/delta-stat/money/counter-pair/target-meter/unit-stat/progress-bars; lollipop/win-loss/dot-matrix/range/bubbles/star-bar/columns/delta-list/mini-gauge/histogram; full-date/month-name/time-of-day/quarter/days-left/unix/two-zones/next-weekday; daylight/moon-%/season-%/golden-hour; goal/steps/streak-pair/reading-list/mood-today/budget; welcome/price-tag/special/phone/social/wayfinding.
- **Why:** "Type on the screen" must hold the *moment you click*, not after a double-click or a manual insert. Keeping every new block computed/prop-only means the screen runtime stays tiny (16 kB gzip) and CI stays offline-safe — no network in tests.
- **Revisit when:** click-to-place-caret at the exact character, or a block that needs a live fetcher (those go through the P4 integrations phase).
### 029 — On-board editing, data bindings, and integrations
- **Status:** accepted · 2026-06-13
- **Context:** Editing a block meant trips to the side panel; charts were hardcoded prop strings; there was no way to connect an app. Three coupled asks: edit on the board, make blocks reference live data, connect productivity apps.
- **Decision (designed via an independent 4-architecture → 3-judge panel; spec in [docs/INTEGRATIONS-SPEC.md](INTEGRATIONS-SPEC.md)):**
  - **On-board editing.** A floating **block toolbar** anchors to the selected block via `geometry.blocks` (Edit · Change-type · ⟿ Data · Options · Delete). Single-click shows it; the ⠿ handle still moves. Options edits the block's fields + emphasis in an on-board popover; the side `PropertiesPanel` is demoted to **board settings only**.
  - **Smart data.** One optional `source` field on the block base `b` (spreads to all ~200 types via `...b`, `.optional()` ⇒ no migration, still v3). It names a provider + query + a `{{path}}`/items/fields/transform **map**. The server resolves bound blocks inside `resolveWidgetData`'s `Promise.all(map)` loop (early `return`, not the wrong `continue`), via the shared `cached()` egress keyed by **connection+kind+query** (not block id) so N blocks on one source dedup to one fetch. A screen-side `boundNums`/`boundStr`/`boundLines` bridge feeds resolved data to the chart/stat/list renderers (they ignore `data` otherwise) and **falls back to props** when null — offline-safe, zod stays out of the screen.
  - **Integrations.** Per-user `connections` (migration 005) with **AES-256-GCM** secrets (`secrets.ts`, key from `GLANCEOS_SECRET_KEY` or an auto-generated `0600` key file) in a **separate `connection_secrets` table never SELECTed into a response**. A provider registry: works-today **REST/JSON, GraphQL, iCal URL (Google/Apple/Outlook calendars), published Sheets CSV, RSS** + token providers **Todoist, GitHub, Notion, Linear**. The Integrations page connects an app once; the Studio's ⟿ Data tab binds a block to a connection's resource (or a public URL) with a live Test preview.
  - **SSRF guard** in the shared `cache.ts` egress (`assertSafeUrl`): resolves DNS before every fetch and refuses private/loopback/link-local/cloud-metadata addresses (opt-out `GLANCEOS_ALLOW_PRIVATE_EGRESS=1`) — retro-protects the existing jsonFeed/ics/headlines URL blocks.
- **Why:** Composition over invention — every layer rides an existing primitive (the `style`-style optional field, the `cached()` fetcher shape, `data[b.id]`, the `geometry.blocks` boxes). Secrets never leave the server; bound blocks degrade to props; CI stays offline.
- **Verified live:** a bar chart bound to CoinGecko's 7-day series renders 8 live bars; a list bound to GitHub issues (via a connection) shows real titles; a cloud-metadata URL is blocked → null.
- **Revisit when:** OAuth2 providers (Google/Microsoft/Notion/Apple — scaffolded design in the spec, gated on user-supplied client id/secret) and in-place table-cell editing land.

### 030 — Studio: Notion-true editing, handle menu, 39 sizes, modern chrome
- **Status:** accepted · 2026-06-13
- **Context:** The Studio had 4 raw screen sizes, a permanent on-select toolbar, an always-visible sidebar with board settings, an invisible drag (text-only chip), double-click-to-insert-text, and Unicode-glyph chrome. The owner wanted it to feel exactly like Notion and look great. Designed via a 6-dimension audit workflow → one consolidated plan.
- **Decision:**
  - **Document typing.** Typing anywhere on the board creates/continues a text line — text is part of the document, not an inserted object; a fresh board starts blank; `/` inserts non-text blocks; **double-click no longer inserts** (removed `onBackgroundDbl`). Global `p`/`?` hotkeys dropped so every printable key types (present/help are buttons). New text lines are born in ONE commit (`insertTextWith`) to avoid an insert-then-append docRef race.
  - **Handle menu.** The ⠿ handle does double duty: a **click opens** a vertical block-options menu (`BlockMenu`); a **drag moves** (4px threshold via `handleDrag.started`, no timer). The permanent floating toolbar is gone. `menuId` is NOT cleared by the selection-change effect (the `menuId === primary` render gate hides stale menus).
  - **Drag preview.** `dragLayer.show(label, glyph)` builds a glass card (glyph + label) centred on the cursor; the source block dims.
  - **39 screen presets** (`ScreenPreset[]`, id/label/w/h/category) grouped by category in an `<optgroup>` select + a hover size label on the stage; legacy `"1920×1080"`-style keys migrate to ids.
  - **Sidebar** collapses/pins Notion-style (`sidebarPinned` persisted; unpinned = floating overlay + reveal button); **Board settings** moved behind a `settings-toggle`; **`+ Block` removed** from the topbar.
  - **Icons:** a dependency-free inline-SVG set (`editor/icons.tsx`, ~22 Feather-style icons) replaces Unicode glyphs across the chrome; plus selection emphasis, focus-visible rings, save-chip icons, responsive topbar.
- **Why:** Compose on the existing primitives (geometry boxes, the gesture/commit model, the `style`-style optional fields). The one structural fix (single-commit text insert) removes a real state race. zod stays out of the screen; the studio chunk is ~45 kB gzip.
- **Verified live:** type-to-create text + continue typing; double-click inserts nothing; `/` opens the menu; ⠿ click opens the vertical menu while drag still moves; 39 grouped sizes switch + persist; sidebar collapse/pin; board settings hidden by default; no Unicode glyphs left in chrome.
- **Revisit when:** in-place per-cell table editing; converting the ~200 block-palette glyphs to SVG; a true caret renderer over the preview iframe.

### 031 — Config app revamp: sidebar shell, dark mode, ⌘K, shared components
- **Status:** accepted · 2026-06-13
- **Context:** The config app had a floating top-nav, inconsistent button-heavy cards, inline error strings, no dark mode, no keyboard navigation, and accessibility gaps. The owner wanted the whole app to feel like Notion. Designed from a 7-dimension audit workflow → one consolidated plan.
- **Decision:**
  - **Shell:** a collapsible + pinnable **left sidebar** (`components/Sidebar.tsx` — brand, ⌘K search, icon nav with `aria-current`, account menu) replaces the top bar; each page renders a sticky `PageHeader` with contextual actions; `ShellCtx` exposes the mobile-drawer opener; responsive off-canvas drawer < 820px; skip link + `<main id="main">`.
  - **Dark mode:** token-only `light/dark/system` via `useTheme()` + `<html data-theme>`; the dark token block lives in `style.css`. The opaque surfaces that hardcoded white (`--card-bg`, `--input-bg`, card/input/sidebar-search) were tokenized so both modes are coherent; `--muted`/`--faint` darkened for AA.
  - **Shared components** (new `components/`): `Toast`+`useToast` (replaces every inline `.issues`/`.ok`), `Modal` (focus-trap, Esc, focus-restore), `ConfirmDialog`+`useConfirm`, `Menu` (kebab/overflow + account), `EmptyState`, `IconButton` (TS-required `aria-label`), `Spinner`, `StatChip`, `PageHeader`, `Sidebar`, `CommandPalette`. `ToastProvider`+`ConfirmProvider` mount in `main.tsx` above the route split so the lazy Studio chunk can use them.
  - **⌘K command palette:** jump to pages / run actions (new setup, toggle theme, log out). Skeletons + rich empty states across pages.
  - **Every page** rebuilt on the shared components for consistency (Screens claim-modal + inline rename + card menu + chips; Setups search + import modal + overflow menu; Hub header search; Playlists icon controls + dirty state; Integrations category groups + Modal; Auth toasts + autocomplete).
  - **Icons:** 12 added to `editor/icons.tsx` (grid/x/moon/sun/bell/list/command/monitor/download/copy/upload) — one icon module, reused app-wide.
- **Why:** Compose on the existing token system; extract only the components with real cross-page duplication (skip speculative Button/Card wrappers). Providers above the split avoid context gaps in the Studio.
- **Verified live (light + dark):** sidebar nav + active state, ⌘K palette (8 commands), Setups search/menu/chips, dark-mode contrast after tokenizing surfaces. 80 tests green; config bundle ~34 kB gzip.
- **Revisit when:** breadcrumbs (needs a richer router), in-card optimistic UI, a notifications surface, or extending dark mode + the icon pass to the public landing page and the Studio chrome.

### 032 — In-place structured editors: table grid + list lines
- **Status:** accepted · 2026-06-19 (v1.3)
- **Context:** Tables edited as one CSV `textarea` and lists as one multiline `textarea` — fiddly, and checklists meant typing `x ` markers by hand.
- **Decision:** Two overlay editors that write back through the same autosave/`stageEdit` path, no schema change. `editor/tableEditor.tsx`: a real grid of per-cell inputs over the block (add/remove rows & columns, header toggle), serializing rows by `\n` and cells by `, ` (the format the screen `table` renderer parses with `/\s*[|,]\s*/`). `editor/listEditor.tsx`: one input per line for `bulletList`/`numberedList`/`checklist`/`steps` (Enter adds a line, Backspace-on-empty removes & jumps up, ↑/↓ navigate); checklists render a checkbox that toggles the `x `/`✓` done marker the renderer reads. Wired in `studio.tsx` by branching the inline-edit render on block type.
- **Why:** A board author shouldn't hand-edit CSV/markers; the marker round-trip keeps the on-wire format unchanged so renderers and migrations are untouched.
- **Verified live:** table cell edit round-trips; checklist checkbox toggles + labels strip the marker; Enter/Backspace add & remove lines with correct focus.

### 033 — Dark mode everywhere + origin-aware Studio breadcrumb
- **Status:** accepted · 2026-06-19 (v1.3) · closes the ADR 031 "revisit"
- **Context:** ADR 031 tokenized the app shell but left the **public landing page** and **Studio chrome** on light-only hardcoded white, and a stray `html { background:#fafafa }` anti-flash literal in `index.html` kept the canvas white in dark mode. The flat hash router had no breadcrumb.
- **Decision:** Tokenize the remaining ~22 light-only surfaces (landing hero mock-board, feature/block/step cards, badges/chips, playlist + picker rows; Studio stage, inline editors, palette, slash menu, present mode, size label) onto the existing light/dark tokens. `html` now follows `var(--bg)`, and the `index.html` anti-flash backdrop + `theme-color` are `prefers-color-scheme`-aware. The board iframe still paints its own paper, so WYSIWYG is preserved (a light board stays white inside dark chrome). Kept literal: the brand button, the e-ink 1-bit preview swatch, the avatar. The router (`router.ts`) remembers the last section (`editorOrigin()`); the Studio top bar shows a `← {origin} / {board}` breadcrumb back to where you came from.
- **Why:** One token system, no second theme path; the literals that must not flip (e-ink swatch, brand) stay literal by exception.
- **Verified live (light + dark):** landing hero + 199-block showcase, Studio chrome + on-board editors, no white flash; breadcrumb returns to Setups vs Screens correctly.

### 034 — OAuth2 scaffold + Google Calendar + Home Assistant
- **Status:** accepted · 2026-06-19 (v1.3)
- **Context:** Token providers (ADR 029) covered apps with personal tokens, but Google/Microsoft-class providers need an OAuth app the agent can't register. The owner runs the server, so they bring their own app credentials.
- **Decision:** A generic OAuth2 (authorization-code + **PKCE S256** + refresh) flow over any provider that declares an `OAuthSpec` in the registry. The self-hoster registers their app in `oauth_apps` (client id + AES-256-GCM-sealed secret, **never returned**). `oauth.ts` holds pure, unit-tested helpers (`pkcePair`, `signState`/`verifyState` — HMAC-signed, expiring; `exchangeCode`/`refreshAccessToken` with injectable `fetch`) and the flow: `GET /api/oauth/:provider/start` → **412** if no app, else 302 to the provider with a signed state + PKCE challenge; `GET /api/oauth/:provider/callback` → verify state, exchange code, seal tokens into `connection_secrets` kind `oauth`. `GLANCEOS_PUBLIC_URL` sets the redirect origin behind a proxy. `connLookupFor` is now **async** and transparently refreshes an expired access token before each fetch (concurrent fetches dedup to one refresh). Two providers ship on it: **Google Calendar** (`calendar.readonly` → the `{title,start,end}` shape the calendar renderer reads) and **Home Assistant** (long-lived token + base URL; entity state + history; private hosts need `GLANCEOS_ALLOW_PRIVATE_EGRESS=1`). Uses the existing `oauth_apps`/`connection_secrets` tables — no migration.
- **Why:** Keep secrecy server-side (sealed app secret + tokens, never serialized); PKCE + signed state make the flow safe even though the "client" is the server; injectable `fetch` keeps tests offline.
- **Verified:** 14 offline oauth tests (PKCE, state round-trip/tamper/expiry, code exchange + refresh, `NoOAuthApp` gating, Google event mapping); live — 412 without an app, authorize redirect carries the right `client_id`/`redirect_uri`/`scope`/signed-state/PKCE/`access_type=offline`, app summary leaks no secret, UI app-form + connect flow.

### 035 — Public read-only share links
- **Status:** accepted · 2026-06-19 (v1.3)
- **Context:** A board could only be seen on a claimed device or the owner's Studio. Sharing a live board (clinic queue, class display) needed a no-login URL.
- **Decision:** `migration 006` adds a nullable, unique `layouts.share_token`. `POST /api/layouts/:id/share` mints an unguessable token (idempotent); `DELETE` revokes; `GET /api/public/board/:token` is **unguarded** (added to the auth-middleware exemption) and returns the screen-state payload with live data resolved under the **owner's** connections. The screen runtime gains a share mode (`/screen/?share=<token>`) that polls the public endpoint and paints from cache first. The Studio adds a Share button + popover (create / copy / open / turn off).
- **Why:** Reuse the exact screen renderer (zero drift); resolve under the owner so bound data still works; an opaque random token + revoke is enough for read-only sharing without per-viewer accounts.
- **Verified:** server test (create → public fetch with data → owner isolation → revoke → 404 → bogus token 404); live — share link renders the board read-only with no login, Studio popover create/copy/revoke.

### 036 — Integrations v1.4: OAuth scaffold v2, connection health, four providers
- **Status:** accepted · 2026-06-20 (v1.4)
- **Context:** The OAuth2 scaffold (ADR 034) powered only Google Calendar + Home Assistant; the owner wanted broad provider coverage, and connections never surfaced their auth state.
- **Decision:** Extend `OAuthSpec` with `tokenAuth:'basic'` (client creds in the Authorization header — Spotify/Notion) and `nonExpiring` (tokens with no expiry/refresh, e.g. GitHub OAuth → far-future expiry, never refreshed). Add typed fetch failures (`AuthError` 401/403, `RateLimitError` 429 with Retry-After/HTTP-date/X-RateLimit-Reset parsing) in `cache.ts`; `cached()` honors the 429 retry window; the resolver flips each connection's status (ok/needs_auth/rate-limited/error) via `markConnStatus` so the Integrations page badges it. Four providers on the scaffold: **Microsoft 365/Outlook Calendar** (Graph `/me/calendarView` → `mapGraphEvents`), **GitHub** (flipped to oauth2 + a `github.search` resource), **Notion** (oauth2 basic, `owner=user`, no scope), **Spotify now-playing** (oauth2 basic; 204 → idle, never throws). No migration — per-connection settings live in the connection `config` JSON.
- **Verified:** offline mapper/exchange/backoff tests; live authorize URLs (scopes, PKCE, owner=user); needs_auth badge on token revoke.

### 037 — Fleet operability: schedules, alerts, dashboard, per-device dither (migration 007)
- **Status:** accepted · 2026-06-20 (v1.4)
- **Context:** Deployed screens had no time-based switching, no offline awareness, no fleet view, and a single hardcoded dither.
- **Decision:** `007_fleet` adds `schedules`, `notifications`, `devices.timezone`, `devices.render_opts`. **Scheduling** (`schedules.ts`): `activeScheduledLayout` resolves the active board from the device's IANA wall-clock (`Intl.DateTimeFormat`), wired as the FIRST branch of `currentLayoutId` so SSE + e-ink inherit it; a 60s tick re-pushes at boundaries. **Alerts**: a 60s sweep (`runAlertChecks`, pure `checkDeviceForAlerts`) flags offline (aged last_seen AND not SSE-connected) + low battery into `notifications` (deduped per device/day/kind), surfaced by a sidebar bell. **Dither**: `dither(gray,w,h,opts)` generalizes to floyd/ordered/threshold + gamma (defaults reproduce the original Floyd — regression-guarded); `render_opts` threads through `renderImage` and into the render cache key; a device-card control + a **Fleet** page (reuses the device summary). Software-only — no hardware.
- **Verified:** wallClock tz/DST tests, schedule-beats-playlist integration test, alert-logic + dither tests; live schedule editor, notifications bell, Fleet table.

### 038 — Studio depth: XSS-safe rich text + conditional visibility
- **Status:** accepted · 2026-06-20 (v1.4)
- **Context:** Text was plaintext-only; boards couldn't hide tiles whose data failed.
- **Decision:** `TextProps.format='markdown'` renders a safe inline subset (`**bold**`, `*italic*`, `[t](https://u)`) via `apps/screen/markdown.ts`, which builds DOM nodes only (never `innerHTML`) and emits anchors only for http(s) URLs — `javascript:`/`data:` degrade to plain text. `b.visibility='whenData'` (block base, spreads to all variants) makes `render.ts` skip a cell whose bound source resolved to nothing. Both optional → no migration, still schema v3. Per-board theme beyond light/dark and the undo-history panel were cut (low value on monochrome `vmin` screens / undo already works).
- **Verified live:** bold/italic/safe-link render; a `javascript:` link produces no anchor and no `javascript:` in the DOM.

### 039 — Image upload (migration 008)
- **Status:** accepted · 2026-06-20 (v1.4)
- **Decision:** `008_uploads` + `uploads.ts` store bytes under `${GLANCEOS_DATA_DIR}/uploads/` with a **server-generated UUID filename** (no client filename → no traversal), a mime allowlist (png/jpeg/webp/gif) and a 2 MB cap. `POST /api/uploads` (session-guarded, rate-limited) returns `/uploads/<id>.<ext>`; a read-only static mount serves it; `ImageProps.url` accepts an `/uploads/` path or an http(s) URL. No SSRF surface (server stores bytes, never fetches a user URL). Per-user quota / orphan GC deferred to v1.5.
- **Verified:** 201 + shape + 400 (bad type) + 413 (oversized) + 401 (unauth) tests; live upload → served back as image/png.

### 040 — Reliability bundle
- **Status:** accepted · 2026-06-20 (v1.4) · no migration
- **Decision:** `/health` (no DB) + `/ready` (`SELECT 1` → 200/503) before the API guard; global security headers + a CSP on document/asset responses (verified the studio iframe + SSE still work); an in-memory fixed-window rate limiter (`ratelimit.ts`, `GLANCEOS_RATE_LIMIT=off` switch) on auth/register/claim/display/telemetry/preview/uploads; telemetry validation (out-of-range battery/rssi/firmware dropped so COALESCE keeps the last good reading); Playwright resilience (a `disconnected` handler nulls the browser singleton + `renderGray` retries once with a fresh browser). The limiter is single-container (resets on restart, not cross-replica) — documented.
- **Verified live:** /health + /ready 200, CSP headers present, 11th login → 429, studio renders under CSP.

### 041 — Share polish + account management + backup (migration 009)
- **Status:** accepted · 2026-06-20 (v1.4)
- **Decision:** `009_share` adds `share_expires_at` + `share_pw_hash` (extends 006). Shares gain optional **expiry** (404 when past) and **password** (scrypt via auth.ts; the public endpoint 401s `password_required` until the right `?pw`; the share viewer shows a DOM-built gate and remembers it for the poll). An **account page** (`/account`): rename, change password, log out everywhere (destroy all sessions), download a JSON **backup** (boards/screens/playlists/connection config — NO secrets), and delete the account (password-confirmed; every user-scoped table cascades on `user_id`, so all data is removed — correcting the design brief's "no cascade" assumption). `hashPassword`/`verifyHash` exported from auth.ts for share-password reuse. Cut to v1.5: share QR + OG image, onboarding wizard, app-wide breadcrumbs (the Studio breadcrumb ships).
- **Verified:** share-password gate + account rename/password/export/delete + logout-everywhere tests; live account page + share-password gate (no pw → 401, correct → 200).

### 042 — Secret-key rotation + ops hygiene (v1.5, no migration)
- **Status:** accepted · 2026-06-20 (v1.5)
- **Decision:** `secrets.ts` gains pure `sealWith`/`openWith`; `open()` tries the current key then `GLANCEOS_SECRET_KEY_PREVIOUS`, so changing `GLANCEOS_SECRET_KEY` no longer bricks stored connections. `pnpm --filter @glanceos/server rotate-secrets` (`rotate.ts`) re-encrypts every `connection_secrets` + `oauth_apps` cipher with the current key in one transaction; `index.ts` warns at boot when secrets are undecryptable. The three writers that hardcoded `key_version=1` now record `currentKeyVersion()` (`GLANCEOS_KEY_VERSION`). New `logging.ts`: opt-in JSON request log (`GLANCEOS_LOG=json`) that skips the SSE stream and logs path only (no query/cookies/secrets). The previously-dead `gcRateLimits()` is now on a tick. **Runbook:** set `GLANCEOS_SECRET_KEY`=new + `GLANCEOS_SECRET_KEY_PREVIOUS`=old → run `rotate-secrets` → drop `_PREVIOUS`.
- **Verified:** seal/open cross-key + previous-key fallback tests; full suite green.

### 043 — Integration breadth: Asana, Jira, Trello, Slack + Notion filter builder (v1.5)
- **Status:** accepted · 2026-06-20 (v1.5)
- **Decision:** registry 13 → 17. Asana (PAT), Jira (email+token Basic, JQL), Trello (key+token) are token providers; Slack is OAuth v2 on the existing scaffold and treats `{ok:false}` bodies as errors, mapping `invalid_auth`/`token_revoked`/… to `AuthError` so the connection flips to `needs_auth`. The hardcoded Home-Assistant `baseUrl` became a declarative `EXTRA_CONFIG` map (per-provider non-secret fields → Jira site+email, Trello key render automatically). A Notion **filter builder** (`editor/notionFilter.ts`) compiles field/operator/value rows into a Notion query body, with a raw-JSON escape hatch. Deferred: Jira 3LO/cloudId.
- **Verified:** registry-size + slackError + compileNotionFilter tests; live (17 providers, Jira extra-config fields).

### 044 — Share QR + backup restore (v1.5, no migration)
- **Status:** accepted · 2026-06-20 (v1.5)
- **Decision:** `qr.ts` is a from-scratch, dependency-free QR encoder (byte mode, ECC-M, versions 1–10, best-mask selection, BCH format/version info), config-bundle only. The share popover shows a scannable QR + PNG export; generic OG/Twitter meta added to `apps/screen/index.html` (per-board OG deferred — `/screen` is static). `dumpUser` now exports `playlist_items` (was missing → empty restored playlists). `importUser({mode})` rebuilds a dump server-side: connections get fresh UUIDs (rewritten into board source bindings), layouts/playlists get new ids threaded through items, column-whitelisted, **no secrets** (connections land `needs_auth`); `append` (default) or `replace`.
- **Verified:** RS-generator-poly vs spec + independent-decoder round-trip; import append/replace/forged/malformed/no-secret-leak tests; live QR render + export→import round-trip.

### 045 — Per-board font scale + upload quota/GC (v1.5, no migration)
- **Status:** accepted · 2026-06-20 (v1.5)
- **Decision:** optional `Layout.theme.fontScale` (s/m/l, default m) — existing v3 docs parse unchanged. The screen reads it as a `--font-scale` multiplier; the ~220 `vmin` font-sizes became `calc(Nvmin * var(--font-scale, 1))` (byte-identical at the default). Board settings exposes the control. A per-user upload quota (`GLANCEOS_UPLOAD_QUOTA_MB`, default 50; 0 blocks all) 413s over budget; `gcUploads()` reclaims disk — orphan files always, unreferenced rows when `GLANCEOS_GC_UNREFERENCED_UPLOADS=1` — on a 6h tick.
- **Verified:** usage/GC/quota-413 tests; live (text scales exactly 1.18× at large).

### 046 — i18n scaffold, config-only (v1.5)
- **Status:** accepted · 2026-06-20 (v1.5)
- **Decision:** a tiny dependency-free `i18n.ts` for `apps/config`: `t(key, vars?)` with `{var}` interpolation, missing-key fallback to the key, and locale detection (localStorage / `navigator.language`). English ships (`locales/en.ts`); more locales are a sibling file + registry entry away. Sidebar nav renders through `t()`; the Account page has a language picker. **`apps/screen` stays English** (byte budget; zod-out discipline). A scaffold, not a full sweep.
- **Verified:** t() lookup/interpolation/fallback tests; live (nav via t(), language picker).

### 047 — v1.6 security & ops foundation (first phase of the TV program; no migration)
- **Status:** accepted · 2026-06-20 (v1.6)
- **Decision:** the foundation for the v1.6→v2.0 "Connect to the Big Screen" program (TVs/displays). Security: `fetchers/cache.ts` `isPrivate()` now strips IPv4-mapped IPv6 (dotted `::ffff:a.b.c.d` + hex `::ffff:hhhh:hhhh`) to the embedded v4 — closing an SSRF bypass to cloud metadata / `172.16-31` / CGNAT — and egress moved to **undici** with a connect-time validating dispatcher that refuses private addresses on every connection incl. redirect hops (closing DNS-rebind + redirect SSRF, SNI preserved). Share passwords moved from `?pw=` to **POST `/api/public/board/:token/unlock`** + a short-lived HMAC-signed `HttpOnly` cookie. Rate-limit keys no longer trust `x-forwarded-for` unless the socket peer is in `GLANCEOS_TRUSTED_PROXIES` (`*`=any). Added a **double-submit CSRF** token (readable `glanceos_csrf` cookie = HMAC(session); `x-csrf-token` required on config-plane POST/PUT/PATCH/DELETE; device plane + `/api/public/*` + `/api/auth/*` exempt) and per-user limits on account password/delete. Device timezone validated against `Intl.supportedValuesOf`. Ops/scale: `config.ts` boot-validates `GLANCEOS_*` (throws on bad numbers/URLs) + a root `.env.example`; tick fan-out is staggered across each interval window (no thundering herd); `db.checkpoint()` (WAL truncate + optimize) on a 10-min timer; list queries capped at 1000; Dockerfile runs **non-root** with a HEALTHCHECK and a **baked Playwright Chromium** (so `render.bmp` works on first use); CI adds non-blocking outdated/audit reports. +undici dep (server). 170 tests (SSRF matrix, CSRF-403, share unlock, config). **Deferred within v1.6:** ESLint/Prettier + a coverage gate (avoid a repo-wide reformat) and cursor pagination (to the signage phase).
- **Verified:** new + updated tests green (typecheck/build clean, migrations still replay 001→009); live — a board source pointed at `169.254.169.254` resolves to null (blocked) and a CSRF-less config mutation 403s.

### 048 — v1.7 TV-optimized web runtime (Connect to the Big Screen, no migration)
- **Status:** accepted · 2026-06-20 (v1.7)
- **Decision:** make the existing web screen runtime first-class on TVs/large displays — reused downstream by casting + native. Schema: optional `DeviceProfile` fields (`tvMode`, `safeArea`, `inputMethod`, `burnIn`, `wake`) + an optional `ScreenState.tv` (enabled/safeArea/burnIn/power), all `.optional()` → no migration; `deviceProfile()` reads+clamps them and `composeState` attaches `tvStateFor(device)`. New `apps/screen/src/tv.ts`: opt-in TV chrome (`?tv=1` or a `tvMode` device) — `requestFullscreen` (immediate + first-gesture), a screen `wakeLock` (re-acquired on visibilitychange), and overscan-safe `--safe-*` margins added to the `.page` padding (default 0% = unchanged). `nav.ts`: a framework-free spatial-navigation (pure `nearestInDirection` geometry) over links/`[data-focusable]` for D-pad/remote + a 10-ft `:focus` ring, armed only in TV mode. `burnin.ts`: a slow pixel-shift (gated by `burnIn.pixelShift`); the server computes display **power** from the device's `wake` window in its timezone (`wakePower`, pure, handles inactive days + overnight wrap, via `wallClock`) and an "off" state paints a near-black asleep view with a faint drifting clock. Ported the dependency-free `qr.ts` into the screen so the claim screen shows a big scan-to-set-up QR beside the code. Config: a per-device "TV mode" editor (kiosk toggle, overscan slider, burn-in, sleep window) saving via a new `tv` field on `PATCH /api/devices/:id` (`setDeviceTvSettings`); the device summary exposes the settings. Smart-TV defensive `@supports not (display:grid)` flex fallback. **First-ever `apps/screen` test suite** (vitest+jsdom: qr/tv/nav/burnin). +undici was added in v1.6; no new runtime dep here. Screen bundle ~21 kB gzip, still zod-free, es2017.
- **Verified:** schema/server/screen tests (qr structure, tv mode, nav geometry, shiftOffset cycle, wakePower windows, deviceProfile TV parse) + full typecheck/build; live — `/screen/?tv=1` enters TV mode with the QR claim screen, a claimed TV device round-trips its settings, and 8% overscan applies live (`--safe-top: 8%`).

### 049 — v1.8 casting: Chromecast receiver + sender (AirPlay deferred; no migration)
- **Status:** accepted · 2026-06-20 (v1.8)
- **Decision:** fling a board from the studio to a Chromecast. **Receiver** = the screen runtime in a new `cast` boot mode (`/screen/?cast=1`, `apps/screen/src/cast.ts`): it loads the CAF receiver SDK and, on a `{type:"board",shareToken}` message over `urn:x-cast:com.glanceos.cast`, hands off to **share mode** + TV chrome — so casting reuses the existing public read-only share link and **no device secret crosses the Cast channel**. **Sender** = `apps/config/src/cast.ts` + a "Cast to TV" button in the studio share popover: lazily loads the Cast Sender SDK, opens the native device picker, sends the board's share token. Both are **opt-in**: only when the self-hoster sets `GLANCEOS_CAST_APP_ID` (their registered Google Cast receiver App ID, a public id) does the document CSP widen to allow the gstatic SDKs (`script-src`/`connect-src`) and does `/api/auth/status` expose `castAppId` (so the sender button appears). Unconfigured → CSP stays strict, the SDK is blocked, and `?cast=1` shows a calm "Ready to cast" placeholder. **AirPlay**: a web page can't initiate AirPlay mirroring, so there's nothing to build on web — real AirPlay arrives with the tvOS app (v2.0); users can still mirror a Mac/iOS screen to an Apple TV showing a board. `parseCastMessage` is pure + tested; the screen stays zod-free (~21 kB gzip).
- **Verified:** typecheck/build + 193 tests (incl. parseCastMessage); live — `/screen/?cast=1` enters TV mode with the "Ready to cast" placeholder and does not crash when casting is unconfigured (SDK CSP-blocked), `castAppId` is null in status. **NOT verifiable in this environment** (documented): the real Chromecast flow needs the self-hoster's Cast App-ID registration, HTTPS, and a physical Cast device — that device test is the operator's step.

### 050 — v1.9 digital-signage platform (display groups, fleet commands, proof-of-play, multi-zone; migration 010)
- **Status:** accepted · 2026-06-20 (v1.9)
- **Decision:** turn "one board per screen" into a fleet you manage by **group**, without breaking the single-screen case. Migration `010_signage.sql` (the program's one migration) adds `display_groups` (per-user, with a default board/playlist + a schedule timezone), `devices.group_id` (FK `ON DELETE SET NULL`), `group_schedules` (the exact shape + engine as device schedules from `007`, keyed by group), and `proof_of_play` (+ index). New `groups.ts` is the data model (CRUD, device assignment, group schedules reusing `wallClock`). `state.currentLayoutId()` now falls through **device schedule → device playlist → device layout → group schedule → group playlist → group default** — an ungrouped device, or one with its own board, is byte-identical to before; `pushGroupDevices(groupId)` fans a group change out to its live screens. **Fleet commands**: `POST /api/groups/:id/command` (`reload`/`identify`/`clear-cache`/`screenshot-now`) emit a new SSE `command` event, delivered by `emitGroupCommand` to every connected screen; the runtime's tiny dependency-free `fleet.ts` handles reload, cache-clear, and an inline `identify` flash (`screenshot-now` is a no-op on web — the server already renders via `render.bmp` — and a hook for native shells). **Proof-of-play**: device-plane `POST /api/devices/me/play-log` (rate-limited like telemetry, single or batched, capped at 500/req) writes `proof_of_play` rows; `GET /api/groups/:id/play-log` reports JSON or CSV over a `?days` window; a 6-hourly sweep prunes beyond `GLANCEOS_PLAYLOG_RETENTION_DAYS` (default 90). **Multi-zone layouts**: optional `Layout.zones[]` (each a `rect` in % with its own rows) — `.optional()` → no migration; the screen's `render.ts` factors the page-grid into `buildPage()` and, when zones exist, positions each as an absolutely-placed mini-page (`.page-zones`/`.zone`); a board with no zones renders exactly as before. Config: a new **Groups** page (create/rename/delete, default board, schedule timezone, Reload/Identify, play-log CSV) + a per-device **Group** selector on the Screens page. Zoned boards are authored via the layout API/import today; an **in-Studio visual zone editor** and a **per-group schedule editor UI** are noted follow-ups (the APIs exist and are tested). Screen stays zod-free (~21.5 kB gzip).
- **Verified:** typecheck/build clean across the workspace; migrations replay 001→010; 204 tests (server group fall-back precedence + own-board-wins + per-user isolation + play-log JSON/CSV + command validation; schema zones round-trip; screen render 2-zone geometry + single-page fallback + fleet identify). Live: logged in, created two groups, set a group default board + timezone, and confirmed the Groups page renders the cards with default-board/timezone/Reload/Identify/Play-log (Reload/Identify correctly disabled at 0 screens).
