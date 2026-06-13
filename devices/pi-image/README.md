# devices/pi-image

The bootable appliance — the part of the project people will call "the OS". A Raspberry Pi image that powers on into the dashboard with no keyboard, ever. Empty on purpose: work starts in **P3**, built with Track B (this directory *is* the Linux curriculum).

**Will contain:**
- `KIOSK-RUNBOOK.md` — exercise B1, the most valuable file in this directory: every command needed to hand-convert stock Raspberry Pi OS Lite into a boot-to-dashboard kiosk. The runbook is written *before* any automation and becomes the spec for the pi-gen stage.
- A pi-gen custom stage reproducing the runbook: cage + `chromium --kiosk` pointed at `apps/screen`, systemd units, read-only rootfs (overlayfs) so power-pulls can't corrupt the SD card
- The first-boot Wi-Fi provisioner: NetworkManager AP mode + captive portal (`provisioner-spike/` first; Python is fine here — Track B teaches Linux, not TypeScript)

**Deliberately not a pnpm workspace** — this is shell, systemd, and image-build config, not TS.

**Must never contain:** layouts, settings, pairing UI, or any state a stock screen wouldn't hold. The Pi is dumb glass; the claim code on first boot is rendered by `apps/screen` itself.

**Hardware gate:** nothing is bought until P3 starts (Pi Zero 2 W or Pi 4 + 2 SD cards + known-good PSU, ~₹7k — see [DECISIONS 013](../../docs/DECISIONS.md)).
