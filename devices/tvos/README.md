# devices/tvos

The living-room endpoint: an Apple TV that boots into your GlanceOS dashboard on the big screen. A tiny SwiftUI tvOS app wrapping a fullscreen `WKWebView`.

**Dumb glass.** This app renders NOTHING itself. It loads the GlanceOS web runtime fullscreen — `<HOST>/screen/?tv=1&platform=tvos&native=<ver>` — and that runtime draws everything: layouts, the first-run claim QR + code, live SSE updates, D-pad spatial navigation, screen wake-lock, burn-in pixel-shift, wake/sleep blanking, and overscan-safe margins. The Apple TV's whole job is three things: (1) load the URL in a maximised webview, (2) keep the panel awake at the OS level, (3) let the Siri Remote's key events reach the web page. The server is the source of truth; this shell adds **zero** new server endpoints.

**Must never contain:**
- Layout parsing or rendering — the runtime draws every pixel.
- Board / settings / device state — that lives on the server, mirrored into the webview's `localStorage` by the runtime, never by native Swift.
- A pairing UI — pairing is the runtime's on-screen QR + claim code; the owner scans it in the GlanceOS config app. The shell does nothing for pairing.
- A secret store — the only persisted identity is the `glanceos.identity` the runtime itself writes to webview `localStorage`. No Keychain, no native token.
- A reimplemented navigation layer — the page handles the D-pad. The shell only forwards key events.

**AirPlay note (this is the point of the tvOS target).** The Apple TV is the AirPlay *destination*. People AirPlay **to** it from a phone or Mac. This app does **not** initiate AirPlay and never mirrors the web page anywhere — there is no web-side AirPlay to drive. Real AirPlay belongs to the Apple TV hardware, not to GlanceOS.

## What's here

- `Sources/GlanceOSApp.swift` — the `@main` SwiftUI `App` entry.
- `Sources/ContentView.swift` — hosts the WebView fullscreen (`ignoresSafeArea`); holds the configurable `host` constant and builds the contract URL.
- `Sources/WebView.swift` — a `UIViewRepresentable` `WKWebView` wrapper (JS enabled via `WKWebpagePreferences`, inline media playback, and `isIdleTimerDisabled = true` to keep the screen awake).
- `Info.plist` — app metadata, `UIRequiresFullScreen`, and the ATS exception for LAN HTTP.
- `project.yml` — an [XcodeGen](https://github.com/yonyon/XcodeGen) spec that generates the `.xcodeproj` from the sources + `Info.plist` with **one command** (below).

The `.xcodeproj` is **generated, not committed** — a `project.pbxproj` shouldn't be hand-authored or committed half-formed, so `project.yml` is the source of truth and the generated project is `.gitignore`d.

## Prerequisites

- A **Mac with Xcode** (15 or newer). The tvOS **Simulator** ships with Xcode and needs **no** account — you can run the whole thing there for free.
- An **Apple Developer account** is required **only** to install on a *physical* Apple TV (Xcode needs a signing team; a free personal team works for personal sideloading).
- A reachable, running GlanceOS server on your LAN (e.g. `http://glanceos.local:8080`). See the project's `docs/DEVICE-API.md`.

## Generate the Xcode project (one command)

```sh
brew install xcodegen          # once
cd devices/tvos
xcodegen generate              # reads project.yml → GlanceOS.xcodeproj
open GlanceOS.xcodeproj
```

`project.yml` wires the three `Sources/` files, points `INFOPLIST_FILE` at this folder's `Info.plist` (so the ATS LAN exception + full-screen keys are used as-is), and sets a placeholder bundle id. **Change `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml`** to one you own (reverse-DNS of your Apple ID works for a free personal team), then re-run `xcodegen generate`.

Prefer not to install XcodeGen? You can still create the project by hand: **File ▸ New ▸ Project… ▸ tvOS ▸ App** (SwiftUI/Swift), delete the generated `GlanceOSApp.swift`/`ContentView.swift`, drag in the three files from `Sources/`, set **Generate Info.plist File = No** and point `INFOPLIST_FILE` at this `Info.plist`.

> No app icon asset catalog ships yet — the **Simulator runs without one**; a real-device build may warn until a brand icon is added (tracked separately).

## Set the host URL

Open `Sources/ContentView.swift` and edit the one **CHANGE ME** line:

    static let host = "http://glanceos.local:8080"

Point it at your server — the mDNS name `http://glanceos.local:8080` (the project default) or a fixed LAN IP like `http://192.168.1.42:8080`. Do not point it at a real public domain. If you serve GlanceOS over HTTPS, use the `https://…` URL and you can remove the ATS exception from `Info.plist` entirely.

The shell builds exactly this URL and nothing more:

    <host>/screen/?tv=1&platform=tvos&native=1.0.0

`?tv=1` switches the runtime into kiosk mode; `platform=tvos` tags the device in the fleet; `native=<ver>` (the `nativeVersion` constant) reports this shell's build.

## Run it

- **Simulator (no account):** pick an **Apple TV** simulator in Xcode's run-destination menu and press **Run** (Cmd-R). Use the **Hardware ▸ Apple TV Remote** (or the keyboard arrow keys) to drive the on-screen focus — those arrive in the web page as `ArrowUp/Down/Left/Right` + `Enter`.
- **Real Apple TV (needs a signing team):** put the Apple TV and your Mac on the **same network**, then in Xcode add it via **Window ▸ Devices and Simulators** (pair with the on-screen code). Select the **Developer Team** on the target's **Signing & Capabilities** tab, choose the Apple TV as the run destination, and press **Run**. Xcode signs, installs, and launches it.

On first launch the runtime auto-registers and shows a big **QR + short claim code** on the TV. Scan it (or type the code) in the GlanceOS config app to bind the screen to a board. From then on it's live over SSE — the Siri Remote moves focus and `Menu` acts as Back, all handled by the page.

## Honest caveats

- Requires a Mac with **Xcode**; on-device install requires an **Apple Developer account** (a free personal team is enough for personal sideloading, with the usual 7-day resign cadence). The Simulator needs neither.
- The ATS exception (`NSAllowsLocalNetworking`) exists because GlanceOS is **LAN HTTP by default**. It permits cleartext only to local-network hosts; serve over HTTPS and you can drop it.
- **Not CI-built** (Apple signing needs a developer account/cert that generic CI lacks). But the project is now **one command to generate** (`xcodegen generate` from `project.yml`) and then builds/runs in Xcode — no hand-assembly required.
- The app keeps the screen awake (`isIdleTimerDisabled`); the Apple TV will not sleep while it's foregrounded. The runtime's own wake/sleep blanking (its dark "asleep" screen during off-hours) still applies inside the web page.
