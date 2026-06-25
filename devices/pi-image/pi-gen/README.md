# devices/pi-image/pi-gen — the flashable kiosk image

A [pi-gen](https://github.com/RPi-Distro/pi-gen) **custom stage** that turns the
official Raspberry Pi OS build pipeline into a one-command **boot-to-dashboard
GlanceOS appliance**: flash the `.img`, power on, and the Pi comes up fullscreen
on your GlanceOS server's `?tv=1` runtime — no keyboard, no desktop, no manual
install.

This is the "image later" half promised by the parent
[`../README.md`](../README.md). The hand-conversion path (runbook +
`install-kiosk.sh`) still exists for turning a Pi you already booted into a
kiosk; this stage bakes the **exact same** launcher, systemd unit, host-URL env
file and no-blank kernel arg straight into a fresh SD image.

## Why a stage, not a fork

`stage-glanceos/01-kiosk/00-run.sh` copies the canonical
[`../start-kiosk.sh`](../start-kiosk.sh) and
[`../glanceos-kiosk.service`](../glanceos-kiosk.service) into the image rootfs.
There is **no second copy** of the kiosk logic to keep in sync — the image and
the hand-install path are guaranteed identical because they ship the same files.

## What the stage does

1. **Packages** (`00-packages`): `cage` (a single-app Wayland kiosk compositor),
   `chromium-browser`, `unclutter`.
2. **Kiosk** (`01-kiosk/00-run.sh`):
   - installs the launcher to `/usr/local/bin/glanceos-start-kiosk` and the unit
     to `/etc/systemd/system/glanceos-kiosk.service` (rewriting `User=` to the
     image's first user);
   - writes `/etc/glanceos-kiosk.env` with your `GLANCEOS_URL` (editable
     post-flash);
   - appends `consoleblank=0` to the kernel `cmdline.txt` (no framebuffer blank);
   - drops a `getty@tty1` **autologin** override (same effect as
     `raspi-config` boot-behaviour B2, written directly so it works on Lite);
   - `systemctl enable glanceos-kiosk.service` and
     `systemctl set-default graphical.target` (cage provides the session, so no
     display-manager is needed).
3. **Export** (`EXPORT_IMAGE`): pi-gen writes a flashable
   `*-glanceos-kiosk.img` to `deploy/`.

Still **dumb glass** — the image renders nothing itself. Every pixel (layout,
claim QR, D-pad nav, wake/sleep, burn-in shift, overscan-safe margins) comes
from the GlanceOS web runtime. The image adds **zero** server endpoints.

## Build it

> **NEEDS a Linux build host.** pi-gen builds a Raspberry Pi OS image in a
> Docker container / `binfmt` ARM chroot and needs root + a few GB of disk. It
> does **not** run on macOS or in this repo's CI today — run it on a Linux box
> (or a Linux VM). The build takes ~20–40 min.

```sh
# 1. Get pi-gen
git clone https://github.com/RPi-Distro/pi-gen
cd pi-gen

# 2. Point it at this stage (either symlink it in, or use an absolute STAGE_LIST)
ln -s /ABSOLUTE/PATH/TO/glanceos/devices/pi-image/pi-gen/stage-glanceos .

# 3. Configure (copy the sample, set a user password + your server URL)
cp /ABSOLUTE/PATH/TO/glanceos/devices/pi-image/pi-gen/config.example config
$EDITOR config            # set FIRST_USER_PASS; set STAGE_LIST to end with stage-glanceos

# 4. Build (bake your server URL in; it stays editable post-flash)
GLANCEOS_URL='http://your-server:8080' ./build-docker.sh -c config

# 5. Flash deploy/*-glanceos-kiosk.img with Raspberry Pi Imager / dd, boot the Pi
```

If you don't bake a URL, the image ships the placeholder
`http://glanceos.local:8080`; edit `/etc/glanceos-kiosk.env` on the boot
partition (or on the running Pi) and reboot.

## Notes & honesty

- **Not yet built/booted in this repo.** The stage is reviewed and shell-checked
  (`bash -n`), but the actual image build runs on the owner's Linux host — it
  cannot run in this macOS CLI / the GitHub Actions used here. Treat it as
  **Tier 2** (build-from-source) in [`../../../docs/PLATFORMS.md`](../../../docs/PLATFORMS.md)
  until verified on hardware.
- **cage vs X.** This stage uses the cage Wayland path. If your base lacks
  `cage`, the hand-install [`../install-kiosk.sh`](../install-kiosk.sh) falls
  back to `xinit`+`openbox`; to bake the X path instead, swap the `00-packages`
  list (`xserver-xorg x11-xserver-utils xinit openbox chromium-browser
  unclutter`) and rewrite the unit's `ExecStart` to the `xinit` line documented
  in [`../glanceos-kiosk.service`](../glanceos-kiosk.service).
- **Read-only overlay** (extends SD-card life) is a good follow-on: enable
  `raspi-config`'s overlay filesystem in a `02-*` sub-stage, or post-flash. Left
  out here so the first image stays easy to reconfigure.
