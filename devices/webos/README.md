# devices/webos

A GlanceOS shell for **LG webOS TVs** — packaged as an `.ipk` and sideloaded onto the TV. Turn an LG smart TV into a dashboard screen with no extra hardware: the app launches, full-screens the GlanceOS web runtime, and gets out of the way.

## Dumb glass

This app is **thin glass**. It renders nothing itself. Its entire job is:

1. load `HOST/screen/?tv=1&platform=webos` in the TV's fullscreen web view,
2. keep the panel awake at the OS level (best-effort, on top of the web wake-lock),
3. let the remote's keys reach the page unmodified.

Everything you see — the layout, the boards, the settings, the on-screen QR + claim code for pairing — is drawn by the GlanceOS web runtime served from **your** server. The server is the source of truth. This shell adds **zero** new server endpoints; it reuses the existing device protocol (register → on-screen QR claim → SSE live updates) exactly as the browser and the Raspberry Pi kiosk do.

**Must never contain:**
- layout parsing or rendering (the runtime draws every pixel),
- board / settings / device state of any kind,
- a pairing UI (the claim QR + code are rendered by the runtime on first load),
- any secret store beyond the device identity the runtime itself persists in the web view's `localStorage`,
- analytics or phone-home of any kind.

If you find yourself adding any of the above to this directory, stop — it belongs in `apps/screen`, not here.

## What's in here

- `appinfo.json` — the webOS app manifest. id `com.glanceos.app`, type `web`, main `index.html`.
- `index.html` — sets `HOST`, then redirects the web view to the runtime in `?tv=1` mode. Contains a guarded, optional luna power call and a single Back-button (461) handler. CSP-friendly and dependency-free.
- `icon.png` (80×80) and `largeIcon.png` (130×130) — GlanceOS brand launcher icons (from `apps/config/public/icon.svg`). Drop in your own to customize.

### About webOSTV.js

The LG `webOSTV.js` SDK is **optional** here. The default app does not bundle it and is fully dependency-free. It is only needed if you want luna power / system APIs. The one luna call in `index.html` (disable the screen saver) is guarded behind a `typeof webOS !== "undefined"` check, so the app runs identically with or without the SDK loaded — the runtime's own web wake-lock already keeps the screen on.

## Set the host URL

Open `index.html` and edit the one line marked **CHANGE ME**:

    var HOST = "http://glanceos.local:8080";

Point it at your self-hosted GlanceOS server base URL (no trailing slash). Use the LAN hostname or IP the TV can actually reach, e.g. 'http://192.168.1.50:8080'. This placeholder is intentional — never ship a real domain baked in.

## Prerequisites

- **ares CLI** — either '@webosose/ares-cli' (npm) or the LG webOS TV CLI bundled with the LG webOS TV SDK. Install the npm one with:

      npm install -g @webosose/ares-cli

- **Developer Mode on the TV** — install the **LG Developer Mode** app from the LG Content Store, sign in with an LG developer account, enable Developer Mode, and note the TV's IP and the **passphrase / key server** details it shows. Developer Mode sessions expire and must be renewed periodically (see the caveat below).
- The TV and your computer on the **same LAN**.

## Register the TV as an ares device (one-time)

Add your TV so ares can talk to it, then confirm:

    ares-setup-device

    ares-device-info --device <name>

Follow the prompts to enter the TV's IP and the Developer Mode passphrase. '<name>' is whatever you call this TV in ares (e.g. 'livingroom').

## Package

From this directory (it must contain `appinfo.json`, `index.html`, and the icons):

    ares-package .

This produces 'com.glanceos.app_1.0.0_all.ipk' in the current directory. The version in the filename matches `version` in `appinfo.json`.

## Install

    ares-install --device <name> com.glanceos.app_1.0.0_all.ipk

To confirm it landed:

    ares-install --device <name> --list

## Launch

    ares-launch --device <name> com.glanceos.app

On first launch the runtime auto-registers the device and shows a large QR code and a short claim code on the TV. Scan / enter it in the GlanceOS config app to bind this screen to a board. The shell does nothing for pairing — it just hosts the page.

To stop it during testing:

    ares-launch --device <name> --close com.glanceos.app

## Caveats (honest)

- **Requires LG Developer Mode**, which expires and must be renewed periodically from the LG Developer Mode app, plus a registered LG developer account and a device added via 'ares-setup-device'. This is a sideload, not a Content Store listing.
- **Not CI-built.** Packaging and installing need a real TV in Developer Mode on your LAN; there is no headless build to wire into CI here.
- The bundled icons are the GlanceOS brand mark (80×80 + 130×130, rendered from the source SVG); swap in your own PNGs of the same sizes to rebrand.
- HTTP-on-LAN is the intended threat model (same as the rest of the fleet, see [ARCHITECTURE](../../docs/ARCHITECTURE.md) and [DEVICE-API](../../docs/DEVICE-API.md)). If your server is HTTPS, set `HOST` to the `https://` URL instead.
