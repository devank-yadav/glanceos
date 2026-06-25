# Platform support — honest tiers

GlanceOS runs anywhere a browser does, plus thin native shells for living-room
hardware. This page is the **straight story** on what's supported, what's built in
CI, and what's actually been run on physical hardware — so nothing here overclaims.

The dumb-glass contract is the same everywhere (see [devices/README.md](../devices/README.md)):
a shell only loads `<your-host>/screen/?tv=1&platform=<id>` fullscreen; the web
runtime draws every pixel and shows the pairing QR. The host is always
configurable per target — never hard-coded to a real domain.

## Tiers

### Tier 1 — Recommended · built & tested in CI

The primary way to run GlanceOS. Exercised on every push (typecheck + tests +
build + the screen size gate) and verified live in a browser.

| Platform | How | Notes |
| --- | --- | --- |
| **Web / PWA** (any modern browser) | open the server URL on a desk monitor, tablet, laptop, or any browser-capable screen; installable as a PWA | The config app **and** the screen runtime are plain web — this is the most-tested path. Chromium, WebKit, and Firefox. |
| **Docker self-host** (the server) | `docker compose up -d` (multi-arch `ghcr.io` image, amd64 + arm64) | CI-published on every release; the same image runs on a Raspberry Pi. |

### Tier 2 — Native shells · build-from-source / sideload

Real, complete shells, but each needs a platform SDK and developer signing that
doesn't belong in a TypeScript CI — so they're built and sideloaded by hand per
their README. **None have been verified on physical hardware from the maintainer's
environment yet** (the web runtime they load *is* tested; the native wrappers are
conventional but unproven on-device — reports welcome).

| Platform | Artifact | Built in CI? | On real hardware? | Needs |
| --- | --- | --- | --- | --- |
| **Raspberry Pi kiosk** | SD-card install (script + systemd + Chromium kiosk) | No (installer runs on the Pi) | Not yet verified | A Pi + the multi-arch image. Flashable `.img` is still pending — see [roadmap C5](launch-roadmap.md). |
| **Android TV / Fire TV** | `.apk` (debug-signed) | On a `v*` tag via [`release.yml`](../.github/workflows/release.yml) | Not yet verified | Sideload to your stick. A store build needs your own keystore. |
| **Apple TV (tvOS)** | Xcode project (`xcodegen generate`) | No | Not yet verified | Runs in the Simulator with no account; on-device needs an **Apple Developer account** (NEEDS-YOU). App-icon asset catalog still pending. |
| **Samsung Tizen TV** | `.wgt` | No | Not yet verified | **Tizen Studio + a Samsung developer certificate** (NEEDS-YOU). |
| **LG webOS TV** | `.ipk` | No | Not yet verified | **webOS CLI + Developer Mode** on the TV (NEEDS-YOU). |

### Tier 3 — Experimental · not a launch claim

| Platform | Status |
| --- | --- |
| **ESP32 e-paper** | A **different, non-webview path**: a battery panel that polls a server-rendered 1-bit BMP. **Scaffold only** — firmware work starts later (see [`devices/esp32-eink/README.md`](../devices/esp32-eink/README.md)). Treat it as a future direction, not a shipping target. |

## What "tested" means here

- **Tier 1** is exercised by CI and by live browser verification each build.
- **Tier 2** shells load the *same* tested web runtime, so the risk is confined to
  the native wrapper (fullscreen, wake-lock, remote keys) — which is small and
  conventional, but has **not** been run on the physical devices yet. If you try
  one, please open an issue with what worked.
- Nothing phones home; there's no telemetry that would tell us otherwise — this
  matrix is updated by hand as devices are actually tested.

## Need a platform that isn't here?

Because every shell is just a fullscreen webview pointed at your server, most
"smart display" devices with a modern browser already work via **Tier 1** — just
open the URL. Open a [feature request](https://github.com/devank-yadav/glanceos/issues)
for a dedicated shell.
