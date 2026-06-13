# Learning Path

This project exists twice: once as software, once as the curriculum that teaches me to build it. I'm coming from Python (Flask, Django, SQLite) with basic HTML/CSS/JS and some Swift. Modern TypeScript, Linux internals, and embedded C++ are the new ground. This document is the study plan — six tracks, each feeding specific phases of [ROADMAP.md](ROADMAP.md).

> **Mode note (2026-06-12, see [DECISIONS 014](DECISIONS.md)):** platform v0.1 was built before this curriculum was walked, so the codebase now exists. The tracks below stand unchanged, but the exercises change character: instead of writing each piece for the first time, **read → trace → modify → rebuild**. The strongest version of any exercise here is now: delete the real module (say, `apps/server/src/hub.ts`), rebuild it from the linked resource, then `git diff` against the original and understand every difference.

## Ground rules

1. **40/60.** At most 40% of any week is study; at least 60% is building. A resource earns its place only if it unblocks the next artifact.
2. **Every resource is paired with an exercise that lands in this repo.** No sandbox throwaways. If the exercise has no repo path, it's entertainment, not learning.
3. **The 90-minute rule.** Stuck longer than 90 minutes: write the question down in the journal (what I tried, what I expected, what happened), then either move to another task or ask someone. Unbounded debugging at the edge of knowledge is how projects die.
4. **Journal.** One markdown file per phase in `docs/journal/` (created as I go). Half build log, half "questions I couldn't answer yet." This becomes launch-post material in P6.

## Python → TypeScript Rosetta

The mental remapping, so familiar things stay familiar:

| Python | TypeScript / Node | Watch out |
|---|---|---|
| `dict` | object literal / `Map` | objects coerce keys to strings; `Map` doesn't |
| list comprehension | `.map()` / `.filter()` / `.reduce()` | no lazy generators by default; chains allocate |
| f-string | template literal `` `${x}` `` | — |
| decorator | higher-order function / middleware | same idea, no `@` sugar on plain functions |
| `asyncio` + `await` | event loop + `Promise` + `await` | the loop is *always running*; nothing like `run_until_complete` |
| `pip` + `venv` | `pnpm` + `node_modules` | isolation is per-project by default — venv is the built-in behavior |
| `requirements.txt` | `package.json` + lockfile | lockfile is committed, always |
| `pytest` | `vitest` | same spirit: plain functions, assertions |
| Flask app / blueprint | Hono app / sub-router | middleware ordering matters the same way |
| Jinja2 | template literals (server), DOM/JSX (client) | client rendering replaces server templating here |
| gunicorn | the Node process itself | Node is the long-running server; no separate WSGI layer |
| `if __name__ == "__main__"` | an ESM entry module | modules execute on import — design for it |
| type hints + mypy | TypeScript (erased at compile) + zod (runtime) | TS types vanish at runtime — zod is the runtime half |

## Track A — TypeScript & the modern web, for a Python dev

**Why:** Everything in P1–P2 is TS. The dashboard runtime is web tech no matter what, so this is the critical path.
**Already earned by Python:** HTTP/REST semantics, async as a concept, package management as a concept, SQL. Skip those chapters everywhere.

**Topics, in order:**
1. The event loop; callbacks → promises → `async/await` — contrast with `asyncio` until the differences feel boring. ([javascript.info/event-loop](https://javascript.info/event-loop))
2. Modern JS essentials: ESM vs CJS (*the* recurring confusion in Node), closures, `this`, destructuring, array methods. ([javascript.info](https://javascript.info), [MDN modules guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules))
3. TypeScript: structural typing, `interface` vs `type`, generics, unions + narrowing, `unknown` vs `any`, strict `tsconfig`. ([TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html))
4. Node vs browser as two different runtimes; `pnpm`, `package.json` scripts, `tsx` for running TS directly.
5. The DOM without a framework: `querySelector`, events, `fetch`, building a render loop by hand. ([MDN DOM guide](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model))
6. Vite: dev server, HMR, build targets (and why `apps/screen` targets conservative browsers). ([vite.dev/guide](https://vite.dev/guide/))
7. *(just before P2c)* Preact: components, props/state, hooks. ([preactjs.com/tutorial](https://preactjs.com/tutorial))

**Exercises (all land in this repo):**
- **A1 — Flask→Hono port.** Take one small JSON endpoint from my billgenerator project, rewrite it three times: bare `node:http`, then Hono. Land it in `apps/server/exercises/01-flask-to-hono/` with a journal note comparing routing, middleware-vs-decorators, and JSON handling line by line.
- **A2 — The clock widget.** A ticking clock + date in vanilla TS + Vite, no framework. Lands in `apps/screen/exercises/clock/`; in P2b it graduates into the first real widget (`src/widgets/clock.ts`).
- **A3 — Type the schema twice.** Hand-write TS interfaces for the layout document in [ARCHITECTURE.md §3](ARCHITECTURE.md). Then redo it in zod and generate the types with `z.infer`. Feeling the duplication disappear is the point. Lands in `packages/schema/exercises/`.

## Track B — Linux, boot, and kiosk: the real "OS" learning

**Why:** P3 turns a Raspberry Pi into the plug-and-play appliance. This track is where "I want to build an OS" becomes real, transferable systems knowledge.
**Already earned:** shell basics (cd, pipes, ssh). systemd and everything below it will be new.

**Topics, in order:**
1. What actually happens at power-on: firmware → bootloader → kernel → init (systemd). Pi specifics: `config.txt`, `cmdline.txt`. ([Raspberry Pi documentation](https://www.raspberrypi.com/documentation/))
2. systemd: units, targets, dependencies, `journalctl`. Write and debug the kiosk service myself. ([systemd for Administrators](https://0pointer.net/blog/projects/systemd-for-admins-1.html), [Arch Wiki: systemd](https://wiki.archlinux.org/title/Systemd))
3. The display stack: framebuffer vs DRM/KMS, X11 vs Wayland, and why a bare kiosk compositor ([cage](https://github.com/cage-kiosk/cage)) + `chromium --kiosk` needs no desktop environment.
4. Read-only root filesystems: overlayfs, tmpfs logs, why SD cards corrupt on power-pull and how appliances survive it.
5. Image building with [pi-gen](https://github.com/RPi-Distro/pi-gen): stages, docker-mode builds, turning my manual setup into a reproducible `.img`.
6. First-boot Wi-Fi provisioning: NetworkManager/`nmcli` hotspot mode, the captive-portal DNS trick, how phones detect portals (`generate_204`). ([Arch Wiki: NetworkManager](https://wiki.archlinux.org/title/NetworkManager))
7. Debugging headless boots: serial console, SSH-on-first-boot, reading `journalctl` from a pulled SD card.

**Exercises:**
- **B1 — The manual kiosk.** Before any automation: hand-convert a stock Raspberry Pi OS Lite into boot-to-dashboard, documenting *every command* in `devices/pi-image/KIOSK-RUNBOOK.md`. That runbook then *is* the spec for the pi-gen stage. (This is the single highest-value exercise in the project.)
- **B2 — Stock build first.** Build an unmodified pi-gen image, flash it, boot it. Learn the pipeline before customizing it.
- **B3 — Provisioning spike.** `nmcli` hotspot + a ~20-line captive portal that accepts Wi-Fi credentials and switches the Pi onto the network. Python is allowed here — Track B teaches Linux, not TypeScript, and Pi OS ships Python. Lands in `devices/pi-image/provisioner-spike/`.

## Track C — Networking, provisioning, auth & pairing

**Why:** The claim-code flow and the SSE channel are the product's spine (P2), and provisioning (P3) is the plug-and-play magic.
**Already earned by Flask/Django:** HTTP semantics, cookies/sessions as concepts, password hashing as a concept (relearn the API: argon2).

**Topics, in order:**
1. Finding the server on a LAN: DNS, mDNS/avahi (`glanceos.local`).
2. Device pairing done right: the OAuth 2.0 Device Authorization Grant ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628) — short and readable; my pairing flow in [ARCHITECTURE.md §5](ARCHITECTURE.md) is a deliberate simplification of it). Device identity: UUID + secret, what each request carries.
3. Web-app auth, single-user first: one password, session cookie. Shipped with Node's built-in scrypt ([DECISIONS 016](DECISIONS.md)); study [argon2](https://github.com/ranisalt/node-argon2) as the upgrade path.
4. SSE on the wire: `text/event-stream`, reconnection, `Last-Event-ID`; when WebSockets are genuinely needed (spoiler: not for dumb glass); why battery devices poll instead. ([MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [High Performance Browser Networking](https://hpbn.co/) — SSE/WebSocket chapters)
5. The LAN threat model; why LAN TLS is genuinely awkward ([mkcert](https://github.com/FiloSottile/mkcert)) — feeds the P3 decision logged in ARCHITECTURE §12.

**Exercises:**
- **C1 — SSE in 30 lines.** Bare `node:http` SSE endpoint + an `EventSource` page. Kill the server, watch reconnection happen for free. Lands in `apps/server/exercises/02-sse-30-lines/`; becomes the real SSE hub's mental model.
- **C2 — Re-derive the pairing diagram.** Close ARCHITECTURE.md, draw the register→claim→stream sequence from memory on paper, then diff against §5. Repeat until the diff is empty. (Understanding check, no code.)

## Track D — Platform engineering

**Why:** This is the difference between "a web app" and "a platform": versioned schemas, data pipelines, rendering, integrations. Runs through P2, P4, P5.

**Topics, in order:**
1. Schema-as-contract: zod v4, `z.infer` as the single source of types, `z.toJSONSchema()` for firmware and docs; schema versioning + migrate-on-read. ([zod.dev](https://zod.dev))
2. SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3): why a synchronous API is *fine* (and clarifying) for this workload; hand-rolled migration runner over numbered `.sql` files. ([sqlite.org](https://sqlite.org/docs.html))
3. The widget data pipeline: server-side fetchers, caching by input, per-type cadence. Parse a subset of ICS ([RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545)) by hand — then take the [rrule](https://github.com/jkbrzt/rrule) dependency for recurrence and write down *why* (the buy-vs-build lesson, learned on purpose).
4. The SSE hub + the ETag/`If-None-Match` polling path — two consumers, one `layoutVersion` token.
5. The render pipeline: [Playwright](https://playwright.dev/docs/screenshots) screenshot → [sharp](https://sharp.pixelplumbing.com/) raw buffer → **hand-written Floyd–Steinberg dither** → 1-bit PNG. Dithering is one of those algorithms you implement once and understand forever.
6. OAuth 2.0 authorization-code + refresh tokens (Google Calendar, P4) — and how it contrasts with the device flow from Track C.
7. The [Home Assistant WebSocket API](https://developers.home-assistant.io/docs/api/websocket/): auth, `subscribe_entities`, `call_service` (P4–P5).

**Exercises:**
- **D1 — Golden layouts.** Write the three seed layouts (personal / clinic queue / home status) as JSON, then the zod schema that validates all three. Land them in `packages/schema/fixtures/` — they become the template gallery and the regression fixtures.
- **D2 — Dither lab.** A ~60-line script: photo in → grayscale → my Floyd–Steinberg → 1-bit PNG out. Compare against ImageMagick's output until mine looks right. Lands in `apps/server/exercises/03-dither-lab/`.
- **D3 — HA hello-world.** Home Assistant in Docker (demo mode), then a ~40-line TS script that toggles a demo light over the WebSocket API. Lands in `apps/server/exercises/04-ha-toggle/`.

## Track E — ESP32 + e-ink (deferred until P5 — resist starting early)

**Why:** The battery e-paper device is the calmest endpoint and the doc's original dream. It's last because the server render pipeline (Track D) removes most of the risk before any hardware is bought.
**Already earned:** general programming; Swift gives a small head start on value semantics and types. C++-for-MCU is still its own world.

**Topics, in order:**
1. The MCU mental model: no OS, one loop, RAM in KB, why `String` concatenation can crash a device.
2. Toolchain: [PlatformIO](https://platformio.org/) + Arduino framework (decision: not ESP-IDF for v1 — see DECISIONS).
3. Deep sleep, RTC memory, wake stubs — the battery story. ([Random Nerd Tutorials ESP32 series](https://randomnerdtutorials.com/projects-esp32/))
4. Wi-Fi + HTTP from an MCU; why TLS on MCUs hurts and what plain-HTTP-on-LAN means for the threat model.
5. E-paper via [GxEPD2](https://github.com/ZinggJM/GxEPD2): full vs partial refresh, ghosting, why refresh takes seconds.
6. Consuming the server's `raw1` packed framebuffer — binary formats, byte order, bit packing (the format is defined in ARCHITECTURE §8).
7. Buttons: GPIO interrupt wake, debounce, then `POST /api/devices/me/events`. ([Espressif Arduino docs](https://docs.espressif.com/projects/arduino-esp32/en/latest/))

**Exercises:**
- **E1 — Blink, sleep, measure.** Blink + deep-sleep cycle, with actual current measured by multimeter in both states, written down. The battery budget habit starts on day one. Notes land in `devices/esp32-eink/`.
- **E2 — Static image first.** Fetch and draw one fixed 1-bit image from the server before anything dynamic. Every later bug is then known to be in *my* code, not the pipeline.

## Track F — Open-source craft (continuous; peaks at P6)

**Why:** "Open source" is a practice, not a license file.

**Topics:** README-driven development; the ADR habit ([DECISIONS.md](DECISIONS.md)); semver + lightweight [conventional commits](https://www.conventionalcommits.org/); [GitHub Actions](https://docs.github.com/en/actions) — from the existing docs link-check up to pi-gen docker-mode image builds publishing `.img.xz` releases; license literacy ([choosealicense.com](https://choosealicense.com/)); maintainership and burnout boundaries ([opensource.guide](https://opensource.guide/)); launch writing (Show HN, r/selfhosted, r/raspberry_pi); docs site with [Astro Starlight](https://starlight.astro.build/) (P6 only).

**Exercises:**
- **F1 — ADR per decision.** Every pinned choice gets a DECISIONS.md entry *when it's made*, not retroactively. (Seed entries already exist — keep the habit.)
- **F2 — Extend CI.** The repo ships with a docs link-check workflow. When P2 code lands, add typecheck + vitest jobs to it myself.

## Track ↔ Phase matrix

| Phase | Tracks in play | The skill being cashed in |
|---|---|---|
| P0 | F | Positioning, decision hygiene |
| P1 | A, C | TS fluency, SSE mental model |
| P2 | A, C, D | The platform: schema, server, runtime, config UI |
| P3 | B, C | Linux, boot, provisioning — "the OS" |
| P4 | D | OAuth, Home Assistant, templates |
| P5 | D, E | Render pipeline, firmware, buttons |
| P6 | F | Shipping in public |
