# GlanceOS — Road to Launch (overnight build tracker v2)

**Directive (2026-06-24 night):** Owner is asleep; build autonomously through the night toward a real launch. **MODEL UPDATE (owner, latest):** launch as a **FREE, full-featured application — ALL features free at launch. Premium is deferred/undecided — do NOT build paywalls, billing, or feature-gating now.** Ship to **all platforms** (Android TV/Fire TV, Web/PWA/browser-TV, Apple TV/tvOS, Samsung Tizen, LG webOS, Raspberry Pi). Owner's explicit asks this round: **more integrations, more objects, polish every feature, add features you judge important, and finish Tracks A/C/D.** Limits reset **05:39**; a recovery cron resumes the loop.

**ROTATE across ALL tracks — don't starve any.** The open-ended tracks (E integrations, F objects/polish, H audit) must NOT crowd out the earlier launch work (A hardening, **C all-platforms**, D GTM). Each tick advances the **next track in this rotation that has a ready batch**, then records `LAST TRACK: X` in the MORNING SUMMARY so the following tick moves on:

> **rotation:** A → C → D → E → F → G → (then back to A) — with **H** (audit/bug-hunt) used only when the chosen track has nothing ready. This guarantees platforms (C) and GTM (D) keep getting built alongside integrations/objects/features. **Track B (paid multi-tenant/billing) stays DEFERRED** (free launch) — skip it.

**Operating rules (every batch = one commit):**
- Stay safe & reviewable: server+config typecheck clean + ALL tests green + `pnpm --filter @glanceos/screen size` ≤ 30000 gzip.
- Scrub every staged diff for AI/tool/vendor attribution and co-author trailers before committing — remove any; all credit to the owner.
- Migrations must be **additive + backfilled** (no data loss; existing single-tenant users get a default org). Update migration/test counts when touched.
- `zod` stays OUT of `apps/screen`; `billgenerator` repo stays pristine.
- Commit AND push per batch; tick the box here; keep the MORNING SUMMARY at the bottom updated.
- **If a batch needs human input** (paid dev account, live secret, DNS/host, real hardware) → build everything possible *without* the secret, gate it behind env, write a `NEEDS-YOU` note, and move on. **If a batch is too risky to do blind** (e.g. the full async Postgres rewrite) → do the safe scaffolding only, leave the risky part for human review, note it, move on.
- Verify live via Preview MCP when browser-observable.

The build loop drives the tracks roughly in this order, but always picks the next unchecked, unblocked, safe batch. **Track A first (fast, safe, model-agnostic), then interleave B (SaaS spine) + C (platforms) + D (GTM).**

---

## Track A — Launch hardening (model-agnostic; do first)
- [x] **A1 — Security holes.** ✅ `Secure` cookies on session/CSRF/share-unlock + `Strict-Transport-Security` header, both gated on `SECURE_COOKIES` (GLANCEOS_PUBLIC_URL=https… or GLANCEOS_SECURE_COOKIES=on) so local http still works; added `/api/public/*` IP limiter (240/min) + per-board-token `/unlock` limiter (12/min) for share-password brute-force defense; the three 500 handlers now return `{error:"internal error", ref}` (uuid, logged server-side) instead of echoing `e.message`. server tsc clean, 238 tests green.
- [x] **A2 — Backup/restore.** ✅ `src/backup-db.ts`: online `db.backup()` snapshots (consistent, safe while running) → `snapshotDatabase()` + `pruneSnapshots()` + CLI (`pnpm --filter @glanceos/server backup`). Optional in-process scheduled snapshots via `GLANCEOS_BACKUP_INTERVAL_HOURS`/`_KEEP`/`_DIR` (off by default). `docs/BACKUP.md` documents logical snapshots, full volume backup, and the stop→swap→start restore (incl. the secret-key caveat). +2 tests (valid queryable snapshot + retention prune). server tsc clean, 240 tests.
- [x] **A3 — QR claim deep-link.** ✅ New `claim.ts` (`parseClaimCode` + `PENDING_CLAIM_KEY`, sanitized) + 3 unit tests. `main.tsx` captures `?claim=<code>` on boot → stashes to sessionStorage, strips the query, lands on `#/screens`. ScreensPage consumes it (lazy `useState`), opens the Connect modal, and `ClaimForm` prefills + **auto-submits** (`initialCode`). Fixes the false "no typing URLs" promise. config tsc + 219 tests. Live-verified the capture (query stripped → `#/screens`, code stashed); the post-login modal-open step wasn't exercised live because the preview session is logged out, but the stashed code persists until login by design.
- [ ] **A4 — PWA icons.** Real PNG icons (192/512 + maskable + apple-touch) generated from the brand SVG (sharp); wire manifest + index. iOS/Android installability.
- [ ] **A5 — README + landing accuracy + unfurl.** Fix counts everywhere → **213 blocks / 153 templates / 85 integrations**; trim the giant changelog blob to a crisp value prop; add a GitHub repo link + one-line positioning on the landing; add OG/Twitter card meta + a baked `og:image` to config index + server-injected meta for `/`.
- [ ] **A6 — Repo hygiene.** CONTRIBUTING.md, SECURITY.md (disclosure policy), CHANGELOG.md, `.github/ISSUE_TEMPLATE/*`, PR template.
- [ ] **A7 — Templates gallery search** (port palette's search-by-name/category/description) + default sort to the most impressive boards; expand the first-run vibe picker beyond 9/27 categories.
- [ ] **A8 — Keyless live-data starter templates** (Hacker News, crypto, ISS, earthquakes, weather) pre-bound to no-login providers so "pick a template → live data, zero setup" works in the demo.

## Track B — Multi-tenant SaaS + billing — ⏸️ DEFERRED (premium undecided; FREE launch)
> Owner switched to a **free, all-features-free launch**; premium is undecided. **Do NOT build billing, paid quotas, entitlement-gating, or the heavy Postgres rewrite now.** Skip Track B. (Kept here for when premium is decided. A lightweight free "workspaces/teams" feature, if wanted, would be a Track G item — without any paywall.)

- [ ] **B1 — Tenancy schema (migration, additive+backfilled).** `organizations` + `org_members(user_id, org_id, role)`; add nullable `org_id` to every tenant-scoped table (devices, layouts, tasks, queues, connections, uploads, fleet, signage, api_keys, automations, inlets, custom_data, shares, templates); backfill a default personal org per existing user and set org_id. Migration test asserts no data loss. **Keep all existing tests green.**
- [ ] **B2 — Org-scoped authz.** Principal resolver yields (user, activeOrg, role); ownership checks become org-scoped; `requireOrgRole` middleware; replace the single global first-user admin with per-org owner/admin. + tests.
- [ ] **B3 — Org lifecycle + UI.** Create org, invite members (signed token), accept, roles (owner/admin/member), switch active org, per-org settings. Config: org switcher + Members page.
- [ ] **B4 — Per-org gallery + registration/invites** (replace instance-global template gallery + single registration flag with per-org).
- [ ] **B5 — Billing (Stripe, env-gated).** customer+subscription+webhooks; plans (Free/Pro/Team); entitlement gating in middleware (limits: screens, members, integrations, templates); pricing page in config. Builds + tests with a stub; live keys = NEEDS-YOU.
- [ ] **B6 — Tenant ops.** Usage metering, per-org quotas, suspend/kill switch, minimal back-office; tighten abuse guards for hostile multi-tenant traffic (outbound fetch/inlet/oauth surface).
- [ ] **B7 — Postgres Store interface (RISKY — scaffold only tonight).** Define a `Store` interface over the data layer + opt-in Postgres backend behind env; SQLite stays default. The full "every call site async" migration is XL — do the interface/seam + a thin adapter + tests; **leave the full cutover for human review** (note it; do not break SQLite).

## Track C — All platforms, store-ready
- [x] **C1 — CI release pipeline.** ✅ `.github/workflows/release.yml`: on every `v*` tag (and on-demand `workflow_dispatch`) builds the debug-signed Android TV/Fire TV APK (`setup-java 17` + `setup-android` + `./gradlew assembleDebug`), stages `glanceos-androidtv.apk` + a sha256, uploads it as a run artifact, and on tags attaches it to a **GitHub Release** (softprops) with sideload + self-host instructions. No signing secrets (debug-signed). androidtv/README gains a "Download (prebuilt)" section. YAML validated (parses). Verify-by-construction: the Android build can't run in this CLI env (no Android SDK) — it runs on the owner's next tag/dispatch. NEEDS-YOU: Apple/Samsung/LG store builds still need vendor accounts (source-build boundary, documented). Follow-on: **C3** (runtime-configurable host) so the APK isn't pinned to the placeholder URL.
- [ ] **C2 — tvOS Xcode project.** Commit an **XcodeGen `project.yml`** (+ generated `.xcodeproj` if buildable, else documented one-command `xcodegen generate`) so Apple TV is one-command like the others; signing doc (free personal team for sideload; App Store = NEEDS-YOU $99).
- [ ] **C3 — Runtime-configurable host.** First-run on-screen host setup (or QR-encoded host) so the webview shells (Android TV/Tizen/webOS/tvOS) stop hardcoding `glanceos.local:8080` and don't need a rebuild per deployment. Biggest install-friction win.
- [ ] **C4 — Real artwork for all shells.** Brand icon set (Android TV banner+icon, webOS 80/130, Tizen, tvOS app icon + top-shelf/launch image) generated from one source SVG.
- [ ] **C5 — Raspberry Pi flashable image** (pi-gen stage → bootable `.img`, read-only overlay) OR honestly relabel as "installer now, image later" if the pi-gen build can't run safely in CI tonight (note which).
- [ ] **C6 — Honest platform tiers.** Per-platform tier table (flagship / sideload-from-source / later) + on-hardware test matrix (mark untested honestly); relabel/scope `esp32-eink` out of current launch claims.
- [ ] **C7 — Org-aware pairing.** Devices belong to an org; claim assigns the display to the claimer's active org (depends on B1/B2).

## Track D — GTM / launch kit
- [ ] **D1 — Visual kit.** Capture 6–8 hero board screenshots + a Studio editing GIF via the real runtime (Preview MCP); embed at top of README + landing.
- [ ] **D2 — Pricing + positioning page** (SaaS): plans, comparison vs TRMNL/DAKboard, the "open-source core + hosted tiers" story.
- [ ] **D3 — Deploy config for a hosted demo** (fly.io/render/compose manifests + envs) ready to `apply`; actual deploy + DNS + secrets = NEEDS-YOU.
- [ ] **D4 — Launch posts** (Show HN / r/selfhosted / Product Hunt drafts) + a "stranger installs from README in 30 min" dry-run checklist.

## Track E — More integrations (free; server-side providers, zero screen cost)
Same proven pattern as the v9.7 build: each provider is a `reg({...})` in `apps/server/src/providers/registry.ts` (keyless first so it renders immediately; token/OAuth scaffolds light up on connect). Update `registry.test.ts` count + `docs/INTEGRATIONS.md` each batch. ~12–15 providers per batch.
- [x] **E1** — ✅ +12 **keyless** providers (85 → **97**): hackernews (news), wikipedia + dictionary + quotable (reference), frankfurter + binance (finance), iss + spaceflightnews (space), nager public-holidays (calendar), gutendex (books), freetogame (gaming), xkcd (fun). New CAT_LABELs: reference/space/fun. registry.test → 97; docs/INTEGRATIONS.md updated. server tsc + 240 tests; config tsc clean.
- [ ] **E2** — +~12 more.
- [ ] **E3** — +~12 more. (continue until breadth is strong; target 120+ providers)

## Track F — More objects + feature polish (free)
- [ ] **F1** — Preset "objects" (`integrationObjects.ts`) for many more providers — aim every keyless + popular provider ships ≥1 one-click object; keep the schema-validation + transform-contract tests passing.
- [ ] **F2** — Studio/editor polish: rough edges + small UX wins (search where missing, default sorts, empty/error/loading states).
- [ ] **F3** — App-wide consistency & a11y sweep (light+dark): focus states, keyboard-shortcuts help, toasts, error states, mobile.

## Track G — Important new features (owner: "add features you judge important"; all FREE)
- [ ] **G1** — Board version history / restore (deferred Studio direction; high-trust editor feature).
- [ ] **G2** — Multi-page boards + rotation (deferred Studio direction).
- [ ] **G3** — Global search / command-palette coverage across boards, templates, integrations, blocks.
- [ ] **G4** — (loop adds more as the audit surfaces them.)

## Track H — Continuous audit & bug-hunt (NEVER "done" — owner: "don't stop, keep finding & fixing")
The loop must not idle. When A/C/D/E/F/G have no ready batch, run an **audit/bug-hunt** pass (typecheck strictness, dead code, broken/edge UX, a11y, perf, security, doc accuracy, stale claims, live Preview MCP smoke of key flows) → write the findings as new checkboxes under the relevant track → fix the top one this tick. Keep the tree green; keep shipping. This track is intentionally inexhaustible.
- [ ] **H-ongoing** — each idle tick: audit → log findings here → fix one → commit.

## NEEDS-YOU (cannot be done autonomously — queued for the owner)
- Apple Developer account ($99/yr) → tvOS TestFlight/App Store.
- Samsung & LG developer accounts / TV dev-mode certs → Tizen/webOS store submission.
- Stripe account + live keys → real billing (B5 builds against a stub meanwhile).
- A hosting target + domain + secrets → hosted SaaS / public demo (D3 preps the config).
- Real hardware (Fire TV, Samsung, LG, Apple TV, Pi) → on-device test matrix (C6).

---

## MORNING SUMMARY
*(updated each batch by the build loop)*
- Audit complete (12-agent recon, cross-verified): core product is launch-grade; gaps are packaging, polish, and the (now-chosen) SaaS spine. This roadmap is the plan.
- **A1 ✅** security holes (Secure cookies+HSTS TLS-gated, public/unlock rate limits, opaque 500s). server 238 tests.
- **A2 ✅** backup/restore (online snapshots + CLI + optional scheduler + docs/BACKUP.md). server 240 tests.
- **MODEL CHANGED** → FREE launch, all features free, premium deferred. Track B (billing/multi-tenant) DEFERRED. New tracks E (integrations) / F (objects+polish) / G (features) / H (never-stop audit). Cron rebuilt to never idle.
- **E1 ✅** +12 keyless providers → **97** (HN, Wikipedia, dictionary, quotable, Frankfurter FX, Binance, ISS, Spaceflight News, holidays, Gutenberg, FreeToGame, xkcd). server 240 tests.
- Loop set to **ROTATE A→C→D→E→F→G (+H filler)** so platforms/GTM aren't starved (cron 27460db3).
- **A3 ✅** QR claim deep-link (scan → prefill + auto-submit claim; capture live-verified). config 219 tests.
- **C1 ✅** release workflow → builds + attaches the Android TV/Fire TV APK to GitHub Releases on each tag (no secrets); androidtv README "Download" section. (CI build runs on the owner's next tag.)
- LAST TRACK: C
