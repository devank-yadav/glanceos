# KIOSK-RUNBOOK.md

The hand-conversion spec: every command to turn stock **Raspberry Pi OS Lite (64-bit,
Bookworm)** into a boot-to-dashboard GlanceOS kiosk, by hand, with nothing automated. This is
the canonical spec. `install-kiosk.sh` does exactly this and nothing more; if the two ever
disagree, this file wins and the script is the bug.

Do it by hand once. You'll understand every moving part, and you'll be able to debug the
installed unit because you'll know what it wrote.

Target URL the kiosk opens (substitute your own server for the placeholder):

```
http://glanceos.local:8080/screen/?tv=1&platform=pi&native=1
```

`tv=1` makes the runtime do fullscreen, wake-lock, D-pad nav, burn-in pixel-shift, wake/sleep
blanking and overscan-safe margins. We add OS-level always-on + cursor hiding + auto-restart.
Nothing else.

There are two minimal-session options. **Path 1 (cage)** is the lightest and the recommended
default on Bookworm. **Path 2 (X + Openbox)** is the well-trodden fallback if you hit a
Wayland/driver quirk on your specific Pi. Pick one. The installer defaults to cage and falls
back to X if cage is unavailable.

---

## 0. Conventions and assumptions

- You're SSHed into a freshly flashed Raspberry Pi OS Lite, on the network, with your normal
  login user (here written as the literal `pi` — replace with your user where it appears).
- Commands that change the system use `sudo`. Read each before pasting.
- The Bookworm boot partition is `/boot/firmware` (older images: `/boot`).
- We store the host URL in one file, `/etc/glanceos-kiosk.env`, so it can be changed later
  without touching anything else.

```
sudo apt update && sudo apt full-upgrade -y
```

---

## 1. Record the host URL (single source of truth)

```
sudo tee /etc/glanceos-kiosk.env >/dev/null <<'EOF'
# GlanceOS kiosk configuration. Change GLANCEOS_URL to point at your server,
# then: sudo systemctl restart glanceos-kiosk
GLANCEOS_URL=http://glanceos.local:8080
EOF
sudo chmod 0644 /etc/glanceos-kiosk.env
```

Edit `GLANCEOS_URL` to your real server (LAN IP, .local name, or proxy host). The launcher
reads this file and appends `/screen/?tv=1&platform=pi&native=1` itself, so put **only the
base URL** here, no trailing slash.

---

## 2. Kill OS-level screen blanking (belt-and-suspenders for the web wake-lock)

### 2a. Console/framebuffer blanking via kernel cmdline

Append `consoleblank=0` to the single-line `cmdline.txt` (do **not** add a newline — it's one
line):

```
sudo sed -i 's/$/ consoleblank=0/' /boot/firmware/cmdline.txt
# (older images: /boot/cmdline.txt)
```

Verify it's still one line and contains `consoleblank=0`:

```
cat /boot/firmware/cmdline.txt
```

### 2b. DPMS / screensaver

DPMS is disabled at launch by the launcher for the active session (X path uses `xset`; cage
has no DPMS layer). The cmdline change above stops the text-console blank that can flash
before the session starts. Nothing else to do here by hand.

---

## 3. Install the session + browser + helpers

### Path 1 — cage (Wayland kiosk compositor, recommended)

`cage` runs exactly one app fullscreen and exits when it exits — purpose-built for kiosks.

```
sudo apt install -y cage chromium-browser unclutter
```

(Some images package the browser as `chromium` rather than `chromium-browser`. Install
whichever exists; the launcher detects the binary.)

### Path 2 — X + Openbox (fallback)

```
sudo apt install -y xserver-xorg x11-xserver-utils xinit openbox chromium-browser unclutter
```

`x11-xserver-utils` provides `xset` (blanking control); `unclutter` hides the idle cursor.

---

## 4. The launcher script

This is the script that actually starts the kiosk. Install it to
`/usr/local/bin/glanceos-start-kiosk`. The canonical content lives in `start-kiosk.sh` in this
directory — copy it verbatim:

```
sudo install -m 0755 start-kiosk.sh /usr/local/bin/glanceos-start-kiosk
```

What it does, in order:
1. Loads `/etc/glanceos-kiosk.env` and builds the full URL.
2. Picks the Chromium binary (`chromium-browser` or `chromium`).
3. Disables blanking for the live session (X path: `xset s off -dpms s noblank`).
4. Starts `unclutter` to hide the cursor.
5. Clears Chromium's "exited cleanly" flag so no restore bubble appears.
6. Runs Chromium with kiosk flags pointed at the URL, in a dedicated profile under
   `~/.config/glanceos-kiosk/chromium-profile`.

The exact Chromium flags (these are load-bearing — see comments in `start-kiosk.sh`):

```
--kiosk --noerrdialogs --disable-infobars
--check-for-update-interval=31536000
--disable-session-crashed-bubble --disable-features=Translate
--no-first-run --fast --fast-start --autoplay-policy=no-user-gesture-required
--user-data-dir=~/.config/glanceos-kiosk/chromium-profile
--app=<URL>
```

`--app=<URL>` (not a positional URL) gives a chromeless window with no toolbar. `--kiosk`
makes it fullscreen and traps it. `--disable-session-crashed-bubble` + clearing the exit flag
(the launcher rewrites `exit_type`/`exited_cleanly` in the profile's `Preferences`) together
kill the "didn't shut down correctly / restore pages" prompt after a power-pull.
`--check-for-update-interval=31536000` (one year) stops update nags. Standard key events still
reach the page, so the D-pad/remote works with no extra mapping.

> **Do not add `--incognito`.** The runtime persists its `{deviceId, deviceSecret}` in
> `localStorage`, and incognito keeps storage only in memory — so an incognito kiosk would
> re-register and need re-claiming on **every reboot**. The launcher uses a normal persistent
> profile at a **fixed `--user-data-dir`**, so the screen stays claimed across power-cycles.
> If you ever want a truly fresh device, delete that directory and re-claim.

---

## 5. Auto-start on boot + auto-restart on crash (systemd)

We run the kiosk as a systemd unit (not via `.bash_profile`/`xinit` hacks) so we get clean
restart-on-failure and proper ordering after the network.

Copy the unit from this directory and edit the `User=` to your login user:

```
sudo install -m 0644 glanceos-kiosk.service /etc/systemd/system/glanceos-kiosk.service
sudo sed -i "s/^User=.*/User=$(whoami)/" /etc/systemd/system/glanceos-kiosk.service
```

The unit (see `glanceos-kiosk.service`):
- `After=network-online.target`, `Wants=network-online.target` — don't open the URL before
  the LAN is up.
- `ExecStart` runs cage wrapping the launcher (or `xinit` on the X path).
- `Restart=always`, `RestartSec=3` — if Chromium or the session dies, it comes right back.
- Runs as your user with a graphical environment, on the active VT.

Enable autologin to the right target so the unit can grab the console, then enable the unit:

```
# Boot to console with autologin (no desktop). On Lite this is usually already the case;
# raspi-config makes it explicit:
sudo raspi-config nonint do_boot_behaviour B2   # console autologin

sudo systemctl daemon-reload
sudo systemctl enable glanceos-kiosk.service
```

> Why autologin + a systemd unit instead of the classic `~/.bash_profile` startx trick: the
> unit gives us `Restart=always` and `After=network-online.target` for free, and survives a
> Chromium crash without dropping to a login prompt on the TV.

---

## 6. First boot

```
sudo reboot
```

The Pi should come up to a black screen, then the GlanceOS runtime fullscreen showing the
claim QR + code. Scan it in the GlanceOS config app to bind the screen. Done — it now holds
an SSE stream and updates itself.

---

## 7. Verify

```
systemctl status glanceos-kiosk            # active (running)
journalctl -u glanceos-kiosk -b --no-pager # launcher + Chromium logs
cat /etc/glanceos-kiosk.env                # your URL
pgrep -a unclutter                         # cursor-hider running
# X path only:
xset q | grep -A1 'Screen Saver'           # timeout: 0, DPMS disabled
```

---

## 8. Change the URL later

```
sudo nano /etc/glanceos-kiosk.env          # edit GLANCEOS_URL
sudo systemctl restart glanceos-kiosk
```

No reinstall. The launcher rereads the env file every start.

---

## 9. Overscan / resolution (only if the picture is wrong)

The runtime already insets content for overscan-safe margins in `?tv=1`, so a small visible
border is intentional. Touch firmware settings only if the *picture itself* is mis-sized or
cropped by the TV.

Edit `/boot/firmware/config.txt` (older images: `/boot/config.txt`), then reboot:

- Force a mode (example: 1080p60):
  ```
  hdmi_group=1
  hdmi_mode=16
  ```
- TV crops the image (content runs off-screen): enable overscan compensation and tune edges:
  ```
  disable_overscan=0
  overscan_left=24
  overscan_right=24
  overscan_top=16
  overscan_bottom=16
  ```
- Monitor with no overscan but the Pi is letterboxing it:
  ```
  disable_overscan=1
  ```

---

## 10. Revert

```
sudo systemctl disable --now glanceos-kiosk
sudo rm -f /etc/systemd/system/glanceos-kiosk.service \
           /usr/local/bin/glanceos-start-kiosk \
           /etc/glanceos-kiosk.env
sudo systemctl daemon-reload
# undo the cmdline tweak by removing ' consoleblank=0' from /boot/firmware/cmdline.txt
```

That's the whole conversion. `install-kiosk.sh` performs steps 1–5 idempotently.
