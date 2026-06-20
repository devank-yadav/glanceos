#!/bin/sh
# start-kiosk.sh — the GlanceOS Pi kiosk launcher.
#
# Run by the glanceos-kiosk systemd unit (wrapped in cage on Wayland, or by
# xinit on the X fallback). It does the OS-level work the web runtime can't:
# disable blanking for the live session, hide the cursor, kill Chromium's
# restore bubble, then open ONE fullscreen window at the GlanceOS runtime.
#
# Dumb glass: this script renders nothing. It only loads a URL. All layout,
# navigation, claim QR, wake/sleep and overscan handling come from the runtime
# in ?tv=1 mode.
set -eu

# --- 1. Load the host URL (single source of truth) -------------------------
ENV_FILE="/etc/glanceos-kiosk.env"
GLANCEOS_URL="http://glanceos.local:8080"   # placeholder default; override in env file
if [ -r "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

# Strip any trailing slash so we don't build a double-slash URL.
BASE_URL=$(printf '%s' "$GLANCEOS_URL" | sed 's:/*$::')

# The exact contract the shell drives. tv=1 enables the runtime's TV mode
# (fullscreen, wake-lock, D-pad nav, burn-in shift, wake/sleep, overscan-safe
# margins). platform=pi tags the fleet view. native=1 is this launcher version.
SHELL_VERSION="1"
FULL_URL="${BASE_URL}/screen/?tv=1&platform=pi&native=${SHELL_VERSION}"

# --- 2. Pick the Chromium binary -------------------------------------------
if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM="chromium"
else
  echo "start-kiosk: no chromium binary found (tried chromium-browser, chromium)" >&2
  exit 1
fi

# --- 3. Disable blanking for the live session ------------------------------
# X path only: xset controls the X screensaver + DPMS. Harmless no-op under
# cage/Wayland (DISPLAY unset, command may be absent), so guard it.
if [ -n "${DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi

# --- 4. Hide the mouse cursor ----------------------------------------------
# unclutter removes the idle pointer. -idle 0 hides it immediately; the guards
# keep this from failing the script if unclutter or X isn't present.
if [ -n "${DISPLAY:-}" ] && command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0 -root >/dev/null 2>&1 &
fi

# --- 5. Per-boot Chromium profile + kill the restore bubble ----------------
PROFILE_DIR="${HOME}/.config/glanceos-kiosk/chromium-profile"
mkdir -p "$PROFILE_DIR/Default"

# Rewrite the last-exit flags so Chromium never shows the "didn't shut down
# correctly / restore pages" bubble after a power-pull. Best-effort.
PREFS="$PROFILE_DIR/Default/Preferences"
if [ -f "$PREFS" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PREFS" || true
fi

# --- 6. Launch one fullscreen kiosk window ---------------------------------
# Flag rationale (all load-bearing):
#   --kiosk                         fullscreen, trapped, no window chrome
#   --app=<URL>                     chromeless app window (no toolbar/tabs)
#   --noerrdialogs --disable-infobars   no popups / "managed by" bars
#   --check-for-update-interval=...  ~1 year: no update nags on the wall
# NOT --incognito: the runtime persists its device identity (deviceId/secret) in
# localStorage, which incognito keeps only in memory — so an incognito kiosk would
# re-register and need re-claiming on every reboot. The fixed --user-data-dir below
# is a normal persistent profile, so the screen stays claimed across power-cycles.
#   --disable-session-crashed-bubble + cleared flags: no restore prompt
#   --no-first-run --fast --fast-start: skip welcome/first-run flows
#   --autoplay-policy=...           let the runtime play media unattended
# Standard key events reach the page, so the runtime's D-pad/remote nav works
# with no key mapping here.
exec "$CHROMIUM" \
  --user-data-dir="$PROFILE_DIR" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --check-for-update-interval=31536000 \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --no-first-run \
  --fast \
  --fast-start \
  --autoplay-policy=no-user-gesture-required \
  --app="$FULL_URL"
