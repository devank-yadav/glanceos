#!/bin/sh
# install-kiosk.sh — turn stock Raspberry Pi OS (Bookworm) into a boot-to-dashboard
# GlanceOS kiosk. Idempotent: safe to run repeatedly. Reproduces KIOSK-RUNBOOK.md
# steps 1-5. Not destructive — it only adds the kiosk; revert instructions are in
# the README.
#
# Dumb glass: this installs a thin shell that loads ONE URL fullscreen and keeps
# the screen awake. It renders nothing and adds no server endpoints.
#
# Usage (host URL priority: arg > env > default):
#   sudo ./install-kiosk.sh http://192.168.1.50:8080
#   sudo GLANCEOS_URL='http://glance.lan:8080' ./install-kiosk.sh
#   sudo ./install-kiosk.sh            # default http://glanceos.local:8080
set -eu

# --- Resolve paths & inputs -------------------------------------------------
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEFAULT_URL="http://glanceos.local:8080"
URL="${1:-${GLANCEOS_URL:-$DEFAULT_URL}}"

ENV_FILE="/etc/glanceos-kiosk.env"
LAUNCHER="/usr/local/bin/glanceos-start-kiosk"
UNIT="/etc/systemd/system/glanceos-kiosk.service"
CMDLINE="/boot/firmware/cmdline.txt"
[ -f "$CMDLINE" ] || CMDLINE="/boot/cmdline.txt"   # older images

log() { printf '\033[1;36m[kiosk]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[kiosk] error:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Preconditions ----------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "run as root (use sudo)."
command -v systemctl >/dev/null 2>&1 || die "systemd not found — this targets Raspberry Pi OS Bookworm."

# The login user the kiosk runs as (the human who invoked sudo, not root).
KIOSK_USER="${SUDO_USER:-pi}"
[ "$KIOSK_USER" != "root" ] || die "could not determine a non-root login user; run via sudo as your normal user."
id "$KIOSK_USER" >/dev/null 2>&1 || die "user '$KIOSK_USER' does not exist."
KIOSK_HOME=$(getent passwd "$KIOSK_USER" | cut -d: -f6)

# Normalize URL (strip trailing slash) for the message; the launcher also strips.
BASE_URL=$(printf '%s' "$URL" | sed 's:/*$::')
log "host URL      : $BASE_URL"
log "kiosk user    : $KIOSK_USER"
log "full target   : ${BASE_URL}/screen/?tv=1&platform=pi&native=1"

# --- 1. Write the host URL env file (single source of truth) ---------------
log "writing $ENV_FILE"
cat > "$ENV_FILE" <<EOF
# GlanceOS kiosk configuration. Change GLANCEOS_URL to point at your server,
# then: sudo systemctl restart glanceos-kiosk
# Put ONLY the base URL here (no trailing slash, no /screen path).
GLANCEOS_URL=$BASE_URL
EOF
chmod 0644 "$ENV_FILE"

# --- 2. Disable console/framebuffer blanking via kernel cmdline ------------
if [ -f "$CMDLINE" ]; then
  if grep -q 'consoleblank=0' "$CMDLINE"; then
    log "cmdline already has consoleblank=0 ($CMDLINE)"
  else
    log "appending consoleblank=0 to $CMDLINE"
    # cmdline.txt MUST stay a single line — append in place, no newline.
    sed -i 's/[[:space:]]*$//; s/$/ consoleblank=0/' "$CMDLINE"
  fi
else
  log "warning: no cmdline.txt found; skipping console-blank tweak"
fi

# --- 3. Install packages (session + browser + helpers) ---------------------
log "apt update"
apt-get update -y

# Detect a Chromium package name (varies across images).
CHROMIUM_PKG="chromium-browser"
if ! apt-cache show chromium-browser >/dev/null 2>&1; then
  CHROMIUM_PKG="chromium"
fi

# Prefer cage (Wayland kiosk compositor). Fall back to X + openbox if cage
# isn't available for this image/arch.
SESSION="cage"
if apt-cache show cage >/dev/null 2>&1; then
  log "installing cage + $CHROMIUM_PKG + unclutter"
  DEBIAN_FRONTEND=noninteractive apt-get install -y cage "$CHROMIUM_PKG" unclutter
else
  SESSION="x11"
  log "cage unavailable — installing X + openbox + $CHROMIUM_PKG + unclutter"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    xserver-xorg x11-xserver-utils xinit openbox "$CHROMIUM_PKG" unclutter
fi
log "session path  : $SESSION"

# --- 4. Install the launcher ------------------------------------------------
[ -f "$SCRIPT_DIR/start-kiosk.sh" ] || die "start-kiosk.sh not found next to this installer."
log "installing launcher -> $LAUNCHER"
install -m 0755 "$SCRIPT_DIR/start-kiosk.sh" "$LAUNCHER"

# --- 5. Install + configure the systemd unit -------------------------------
[ -f "$SCRIPT_DIR/glanceos-kiosk.service" ] || die "glanceos-kiosk.service not found next to this installer."
log "installing unit -> $UNIT"
install -m 0644 "$SCRIPT_DIR/glanceos-kiosk.service" "$UNIT"

# Set the run-as user.
sed -i "s/^User=.*/User=$KIOSK_USER/" "$UNIT"

# Point ExecStart at the chosen session. cage is the default in the file; only
# rewrite for the X fallback. -nocursor on the X server also hides the pointer.
if [ "$SESSION" = "x11" ]; then
  log "rewriting ExecStart for the X path"
  sed -i "s|^ExecStart=.*|ExecStart=/usr/bin/xinit $LAUNCHER -- :0 vt1 -nocursor|" "$UNIT"
fi

# Make sure the cage path actually points at an installed cage binary.
if [ "$SESSION" = "cage" ] && ! command -v cage >/dev/null 2>&1; then
  die "cage package installed but binary not found; rerun and it will fall back to X."
fi

# --- 6. Boot to console autologin so the unit can own the screen -----------
if command -v raspi-config >/dev/null 2>&1; then
  log "setting console autologin (raspi-config B2)"
  raspi-config nonint do_boot_behaviour B2 || log "warning: could not set autologin via raspi-config"
fi

# --- 7. Enable on boot ------------------------------------------------------
log "enabling glanceos-kiosk.service"
systemctl daemon-reload
systemctl enable glanceos-kiosk.service

# --- Done -------------------------------------------------------------------
log "installed. Reboot to launch:  sudo reboot"
log "change the URL later:  sudo nano $ENV_FILE  &&  sudo systemctl restart glanceos-kiosk"
log "logs:  journalctl -u glanceos-kiosk -b --no-pager"
