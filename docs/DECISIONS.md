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