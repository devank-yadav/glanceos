# devices/tizen

A Samsung Tizen TV app (a packaged `.wgt` web application) that turns a Samsung
smart TV into a GlanceOS screen. It is the thinnest possible shell: on launch it
registers the remote keys and redirects the built-in webview to your self-hosted
GlanceOS web runtime in TV mode. That's the whole app.

## Dumb glass

This shell renders **nothing**. It loads `<HOST>/screen/?tv=1&platform=tizen`
fullscreen and the GlanceOS web runtime draws every pixel. In `?tv=1` mode the
runtime already handles fullscreen, the screen wake-lock, D-pad spatial
navigation, burn-in pixel-shift, wake/sleep blanking, and overscan-safe margins.
The server is the source of truth and the device protocol is unchanged: on first
load the runtime auto-registers, shows a big QR + a short claim code on screen,
and you bind the TV from the GlanceOS config app. **This shell adds zero new
server endpoints.**

The shell's only jobs are:
1. Load the URL in a maximised webview.
2. Keep the panel awake at the OS level (`tizen.power`), not only via the web
   wake-lock.
3. Register the TV remote keys so they reach the page as real
   `KeyboardEvent`s — it does **not** reimplement navigation.

**Must never contain:** layout parsing or rendering, board/settings state, a
pairing UI, or any secret store beyond the device identity the runtime itself
persists in the webview's `localStorage`. If you find yourself adding one of
these to the `.wgt`, it belongs in `apps/screen`, not here.

## What's in here

| File         | Purpose                                                                 |
|--------------|-------------------------------------------------------------------------|
| `config.xml` | Tizen web-app manifest: TV profile, internet privilege, `access` origin, fullscreen, app id `GlanceOS0.GlanceOS`, `required_version` 6.0. |
| `index.html` | Minimal page: a "Loading…" splash that immediately hands off to `main.js`. |
| `main.js`    | The `HOST` constant, remote-key registration, OS wake-lock, and the redirect to the runtime. |
| `icon.png`   | 512×512 GlanceOS brand launcher icon (from `apps/config/public/icon.svg`) — drop in your own to customize. |

## Set the host

Open `main.js` and change the one line near the top:

    var HOST = "http://glanceos.local:8080";

Point it at YOUR self-hosted GlanceOS server on the LAN, for example
`http://192.168.1.50:8080`. No trailing slash. The default is a placeholder and
will not resolve on your network. (The remote keys the runtime listens for —
ArrowUp/Down/Left/Right, Enter, and Back — are registered for you in `main.js`;
you should not need to touch that.)

## Prerequisites

- **Tizen Studio** with the **TV extension** (Package Manager → Extension SDK →
  "Samsung Certificate Extension" and the TV emulator/tools). The bundled CLI
  lives at, e.g., `~/tizen-studio/tools/ide/bin/tizen`.
- A **Samsung developer certificate** (author + distributor) created via the
  Certificate Manager in Tizen Studio and tied to your Samsung account and the
  target TV's DUID. Web apps must be signed; an unsigned `.wgt` will not install.
- The **TV in Developer Mode** with your PC's IP allow-listed:
  - On the TV, open Apps, type `12345` on the remote to reveal the Developer
    Mode panel, switch it **On**, and enter your PC's IP under "Host PC IP".
  - Reboot the TV when prompted.
- The TV and your PC on the **same LAN** as the GlanceOS server.
- Put the CLI on your PATH (adjust for your install), for example:

    export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"

## Build the .wgt

You can build from the Tizen Studio IDE (import this folder as a *Tizen Web
Project*, then **Build Signed Package**), or from the CLI:

    cd devices/tizen
    tizen build-web
    tizen package -t wgt -s <your-certificate-profile> -- .buildResult

- `<your-certificate-profile>` is the profile name you created in the
  Certificate Manager (see `~/tizen-studio-data/profile/profiles.xml`).
- The signed `.wgt` is written into `.buildResult/`.

## Connect to the TV and install

Connect the device once over the network (replace with your TV's IP), then
install the signed package:

    sdb connect <TV_IP>:26101
    sdb devices
    tizen install -n GlanceOS.wgt -t <device-name-from-sdb-devices> -- .buildResult

You can also drag the `.wgt` onto the TV from **Device Manager** in Tizen Studio.
After install, launch **GlanceOS** from the TV's Apps row. It will redirect to
your server, and the runtime will show the QR + claim code for pairing.

## Caveats (honest)

- **Requires a Samsung developer certificate and the TV in Developer Mode.**
  This is not a published-store app; it is sideloaded for your own TV.
- **Certificates expire.** Samsung developer/distributor certificates have a
  limited validity and are tied to the TV's DUID. When the cert lapses the app
  stops launching and you must re-sign and re-install. Keep your certificate
  profile backed up.
- **Not CI-built.** There is no headless/CI path for `.wgt` signing here —
  signing needs your local Certificate Manager and Samsung account. Build and
  sideload from a workstation with Tizen Studio.
- **HTTP on the LAN is intentional.** The shell points at a plaintext LAN host
  by design (self-hosted, same threat model as the other devices). If you front
  GlanceOS with HTTPS, just set `HOST` to the `https://` URL.
- The `access origin="*"` in `config.xml` is broad on purpose so the webview can
  load whatever `HOST` you set; the page itself only ever navigates to that one
  server.
