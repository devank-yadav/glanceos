# devices/

The non-TypeScript **glass** targets — the native shells that put GlanceOS on a real screen. Everything in here is deliberately **outside the pnpm workspace**: it's APKs, widget packages, Xcode projects, and SD-card images, each with its own SDK, toolchain, and signing story. The web app lives in `apps/`; this directory is just the physical glass it runs on.

None of these are built in the main CI — each needs a platform SDK and developer signing that doesn't belong in a TypeScript pipeline. They are built and sideloaded by hand, per the per-target README.

## The dumb-glass contract (read this once, it's the same for every target)

A device shell is **thin glass**. It renders nothing itself. Its entire job is to load the GlanceOS web runtime fullscreen and get out of the way — the runtime draws every pixel.

Each shell loads:

```
<HOST>/screen/?tv=1&platform=<id>
```

where `<HOST>` is **your** self-hosted GlanceOS server (e.g. `http://glanceos.local:8080`) — always configurable per target, never hard-coded to a real domain.

On first load the runtime **auto-registers** the device and shows a big **QR + short claim code** on screen. The owner scans/enters it in the GlanceOS config app to bind the screen. The shell does **nothing** for pairing.

In `?tv=1` mode the runtime already handles: fullscreen, screen wake-lock, D-pad spatial navigation, burn-in pixel-shift, wake/sleep blanking, and overscan-safe margins.

So the shell's whole job is exactly three things:
1. **Load the URL fullscreen** in a maximised webview/browser.
2. **Keep the screen awake at the OS level** — don't trust only the web wake-lock.
3. **Let remote keys reach the page** — give the webview focus so standard `KeyboardEvent`s land. The runtime listens for `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`/`Enter`/`Escape` and the back-button aliases `XF86Back`/`BrowserBack`/`GoBack`/`Backspace`. Don't reimplement navigation; the page owns it.

**Must never contain** (any target):
- layout parsing or rendering — the runtime draws everything
- board, layout, or settings state
- a pairing/claim UI — the runtime shows the QR
- any secret store beyond the device identity the runtime persists itself in webview `localStorage`
- new server endpoints — the shell reuses the existing device protocol (register → on-screen QR claim → SSE live updates) and adds zero

No analytics, no phone-home. Self-hostable, MIT-spirit.

## The targets

| Target | What it is | `platform=` | Build artifact | Directory |
|---|---|---|---|---|
| Raspberry Pi kiosk | Bootable appliance — Pi powers on into the dashboard, no keyboard ever | `pi` | SD-card image (pi-gen) | [`pi-image/`](./pi-image/) |
| Android TV / Fire TV | Leanback APK; one fullscreen WebView | `androidtv` / `firetv` | `.apk` | [`androidtv/`](./androidtv/) |
| Samsung Tizen TV | Tizen web widget, packaged + signed | `tizen` | `.wgt` | [`tizen/`](./tizen/) |
| LG webOS TV | webOS web app, IPK-packaged | `webos` | `.ipk` | [`webos/`](./webos/) |
| Apple TV (tvOS) | tvOS app, one fullscreen `WKWebView` | `tvos` | Xcode project → sideload | [`tvos/`](./tvos/) |
| ESP32 e-paper | **Different path** — battery panel that polls a pre-rendered 1-bit BMP; not a webview | (polling device) | PlatformIO firmware | [`esp32-eink/`](./esp32-eink/) |

Most rows are webview shells that obey the contract above. **`esp32-eink` is the exception:** it has no browser. It deep-sleeps, wakes, fetches a server-rendered 1-bit bitmap with `If-None-Match`, draws it, and sleeps again — the polling path, with its own protocol and its own README. Read [`esp32-eink/README.md`](./esp32-eink/README.md) before assuming anything in this section applies to it.

> **Support tiers & honest on-hardware status:** see **[docs/PLATFORMS.md](../docs/PLATFORMS.md)**. In short — **Tier 1** (recommended, CI-tested) is the **web/PWA** runtime in any browser plus the Docker server; the webview shells above are **Tier 2** (build-from-source / sideload, not yet verified on physical hardware); **`esp32-eink` is Tier 3** (experimental, scaffold only — not a launch claim).

## The platform-identity wire

`?platform=<id>` and the optional `&native=<shell version>` ride along on the screen URL so the **fleet dashboard** can tell an Apple TV from a Fire Stick from a Pi, and which shell build each one is running. That's the only thing the shell adds to the wire — identity, not behavior. Keep the id stable per target (the table above is the source of truth) and bump `native=` when you ship a new shell build.
