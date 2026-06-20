# devices/pi-image

The bootable appliance — the part of the project people will call "the OS". A Raspberry Pi
that powers on into the dashboard with no keyboard, ever. You point it at your self-hosted
GlanceOS server, it shows a big QR + claim code on first boot, you scan it in the config app,
and from then on the screen just lives on the wall and updates itself.

This directory does not build a custom SD-card image (that's the eventual pi-gen stage). It
ships the **hand-conversion path**: a runbook + an idempotent installer that turn stock
**Raspberry Pi OS (Bookworm)** into a boot-to-dashboard kiosk. PLATFORM_ID is `pi`.

## Dumb glass

The Pi is **thin glass**. It renders nothing itself. Its entire job is:

1. Boot into a minimal graphical session.
2. Open Chromium fullscreen at `<HOST>/screen/?tv=1&platform=pi&native=1` and nothing else.
3. Keep the display awake at the OS level (no DPMS, no screen-blank, no screensaver) — the
   web wake-lock is a belt; this is the suspenders.
4. Deliver real keyboard/remote key events to the page and stay out of the way.

Everything you see on the panel — the layout, the boards, the clock, the claim QR, the
D-pad navigation, the wake/sleep blanking, the burn-in pixel-shift, the overscan-safe
margins — is drawn by the GlanceOS **web runtime** in `?tv=1` mode. The server is the source
of truth. This shell adds **zero** new server endpoints.

### Must never contain

- Layout parsing or rendering of any kind (the runtime draws every pixel).
- Board, settings, or any device state a stock screen wouldn't hold.
- A pairing / claim UI — the claim QR and code are rendered by `apps/screen` itself on first
  boot. The kiosk never asks for anything.
- A secret store beyond the device identity the runtime persists for itself in the webview's
  `localStorage` (it lives under the Chromium profile this installer creates).
- A second URL, a launcher menu, a browser toolbar, or any "home screen". One URL, fullscreen,
  forever.

## How it claims (you do nothing for pairing)

On first load the runtime calls `POST /api/devices/register`, stores its returned
`{deviceId, deviceSecret}` in `localStorage`, and draws a large QR + short claim code on the
panel. Open the GlanceOS config app, scan/enter the code, and bind the screen to a board.
After that the runtime holds an SSE stream (`/api/devices/me/stream`) for live updates. The
kiosk shell is unaware of all of this — it only ever loaded a URL.

## The contract this shell drives

```
<HOST>/screen/?tv=1&platform=pi&native=1
```

- `<HOST>` is **your** GlanceOS server base URL. It is configurable, never hard-coded to a
  real domain. The default placeholder is `http://glanceos.local:8080` — change it (see
  "Set the host URL" below).
- `tv=1` turns on TV mode in the runtime: fullscreen, screen wake-lock, D-pad spatial nav,
  burn-in pixel-shift, wake/sleep blanking, overscan-safe margins. The shell does not
  reimplement any of these.
- `platform=pi` tags the device so the fleet view can show what's running it.
- `native=1` is the shell version (the kiosk launcher), optional but sent so the fleet can
  tell a Pi kiosk from a stray browser tab.

The runtime listens for these `KeyboardEvent.key` values, so a plugged-in keyboard or a
CEC/USB remote that emits them just works:
`ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape XF86Back BrowserBack GoBack Backspace`.
Chromium delivers standard key events to the focused page; the page handles navigation. The
shell maps nothing.

## What's in here

| File | Role |
| --- | --- |
| `KIOSK-RUNBOOK.md` | The canonical hand-conversion spec — every command, by hand, to turn Raspberry Pi OS Lite into a boot-to-dashboard kiosk. The installer automates exactly this. |
| `install-kiosk.sh` | Idempotent POSIX installer that reproduces the runbook: installs packages, writes the launcher + systemd unit, sets the host URL, enables it. |
| `glanceos-kiosk.service` | systemd unit — launches the kiosk on boot, restarts on failure, after `network-online.target`. |
| `start-kiosk.sh` | The launcher the unit runs: exports the URL, kills blanking, hides the cursor, runs Chromium with kiosk flags. |

## Two ways to install

You need a working network connection on the Pi for both (it pulls a few packages with `apt`).

### Path A — flash Raspberry Pi OS Lite, then run the installer (recommended)

Smallest, most predictable. No desktop, just the kiosk.

1. Flash **Raspberry Pi OS Lite (64-bit, Bookworm)** with **Raspberry Pi Imager**. In the
   imager's settings (gear icon) set the hostname, enable SSH, and configure your Wi-Fi /
   locale so the Pi comes up on your network headless.
2. Boot it and SSH in (`ssh <user>@<hostname>.local`).
3. Copy this directory onto the Pi (e.g. `scp -r devices/pi-image <user>@<hostname>.local:~/`)
   or `git clone` your repo there.
4. Run the installer, pointing it at your server:

   ```
   cd ~/pi-image
   sudo GLANCEOS_URL='http://192.168.1.50:8080' ./install-kiosk.sh
   ```

   (Use your server's real LAN address or hostname. See "Set the host URL".)
5. Reboot: `sudo reboot`. The Pi boots straight into the dashboard and shows the claim QR.

### Path B — already have Raspberry Pi OS with Desktop?

The installer also works on a full desktop image: it installs the minimal session pieces it
needs and replaces the desktop autologin target with the kiosk on boot. Run the exact same
command as Path A. Your desktop is still installed (you can disable the kiosk unit and reboot
to get it back), but boot now goes to the kiosk.

If you'd rather do it by hand to understand every moving part, follow `KIOSK-RUNBOOK.md`
top to bottom — the installer is just that runbook, automated and made idempotent.

## Set the host URL

The host URL is **not** baked into the image. You set it once, at install time, three ways
(highest priority first):

```
sudo ./install-kiosk.sh http://192.168.1.50:8080        # 1. positional arg
sudo GLANCEOS_URL='http://glance.lan:8080' ./install-kiosk.sh   # 2. env var
sudo ./install-kiosk.sh                                  # 3. default: http://glanceos.local:8080
```

The installer writes your chosen URL into `/etc/glanceos-kiosk.env` as `GLANCEOS_URL=...`.
**To change it later**, just edit that one line and `sudo systemctl restart glanceos-kiosk`
— no reinstall needed:

```
sudo nano /etc/glanceos-kiosk.env
sudo systemctl restart glanceos-kiosk
```

`http://glanceos.local:8080` is only a placeholder. Use whatever your self-hoster actually
serves on — a LAN IP, a `.local` mDNS name, or your reverse-proxy hostname. Plain HTTP on
the LAN is fine (and is the documented threat model); the runtime needs no TLS to register
and stream.

## Troubleshooting

**A mouse cursor sits in the middle of the screen.**
The launcher hides it two ways: `unclutter` (idle-hide) and Chromium's own behavior under a
cursor-less compositor. If you're on the X path and still see it, confirm `unclutter` is
installed and running (`pgrep unclutter`). On the cage path the cursor is suppressed by
launching with no pointer; plug a mouse in only if you need to debug.

**The screen goes black after a few minutes.**
Something re-enabled blanking. The launcher disables DPMS and the X screensaver
(`xset s off`, `xset -dpms`, `xset s noblank`) and sets `consoleblank=0`. Re-check:

```
xset q | grep -A1 'Screen Saver'      # should show 'timeout: 0'
cat /sys/class/graphics/fbcon/cursor_blink
```

If the *runtime* blanked it on purpose (a configured wake/sleep window), that's expected —
it'll wake on schedule. The OS-level blanking is what this shell kills.

**Wrong resolution, black bars, or content runs off the edges (overscan).**
First try letting the runtime handle it: `?tv=1` applies overscan-safe margins, so a little
edge inset is normal and intended. If the *picture itself* is mis-sized or cut off by the TV:

- Edit `/boot/firmware/config.txt` (Bookworm path; older images use `/boot/config.txt`).
- For a fixed mode, set e.g. `hdmi_group=1` + `hdmi_mode=16` (1080p60) — see the Raspberry Pi
  video modes table for your panel.
- If the TV crops the image, enable overscan compensation:
  `disable_overscan=0` and tune `overscan_left/right/top/bottom`. If the Pi is letterboxing a
  display that has no overscan, set `disable_overscan=1`.
- Reboot after any `config.txt` change.

**It shows the claim QR again after I already paired it.**
The runtime re-registers when the server returns 401 (e.g. the server DB was wiped) or when
the Chromium profile was cleared. The identity lives in
`~/.config/glanceos-kiosk/chromium-profile`. Don't delete that profile if you want the device
to stay claimed.

**"Chromium didn't shut down correctly" bubble / restore-pages prompt.**
Handled: the launcher passes `--disable-session-crashed-bubble` and rewrites the profile's
exit type to `Normal` on each start, so the restore bubble never appears after a power-pull.
If you customized the launcher, keep those two safeguards. (The launcher deliberately does
**not** use `--incognito` — that would wipe the device identity on every reboot.)

**Check what's happening.**

```
systemctl status glanceos-kiosk
journalctl -u glanceos-kiosk -b --no-pager
cat /etc/glanceos-kiosk.env
```

## Uninstall / revert

```
sudo systemctl disable --now glanceos-kiosk
sudo rm -f /etc/systemd/system/glanceos-kiosk.service
sudo rm -f /usr/local/bin/glanceos-start-kiosk /etc/glanceos-kiosk.env
sudo systemctl daemon-reload
```

On a desktop image, also restore the boot target you had before
(`sudo systemctl set-default graphical.target`) and reboot.

## Why not a custom image yet

A pi-gen stage with a read-only overlayfs rootfs (so a power-pull can't corrupt the SD card)
is the eventual destination — this runbook is deliberately written first and becomes that
stage's spec. Hand-conversion proves every command on real hardware before any of it is
frozen into an image. (The earlier "no hardware before P3" gate is lifted; this is being
tested on a real Pi.)
