#!/bin/bash -e
# Layer the GlanceOS kiosk into the image rootfs. This is install-kiosk.sh
# expressed in the pi-gen idiom: same launcher, same systemd unit, same host-URL
# env file, same no-blank kernel arg, same enabled service — baked into the SD
# image instead of run by hand on a booted Pi.
#
# Single source of truth: we copy the EXACT scripts the hand-conversion path
# ships (devices/pi-image/{start-kiosk.sh,glanceos-kiosk.service}) so the image
# can never drift from the documented, tested behaviour.

# devices/pi-image  (canonical scripts live here) <- pi-gen <- stage-glanceos
SRC_DIR="$(cd "${STAGE_DIR}/../.." && pwd)"
LAUNCHER_SRC="${SRC_DIR}/start-kiosk.sh"
UNIT_SRC="${SRC_DIR}/glanceos-kiosk.service"
[ -f "${LAUNCHER_SRC}" ] || { echo "stage-glanceos: ${LAUNCHER_SRC} not found — build with the stage inside the GlanceOS repo." >&2; exit 1; }
[ -f "${UNIT_SRC}" ]     || { echo "stage-glanceos: ${UNIT_SRC} not found." >&2; exit 1; }

# The image's first login user owns the kiosk (pi-gen's FIRST_USER_NAME).
KIOSK_USER="${FIRST_USER_NAME:-pi}"

# Bake the host URL: pass GLANCEOS_URL='http://your-server:8080' when invoking
# pi-gen, else a placeholder. It stays editable post-flash at
# /etc/glanceos-kiosk.env, and the runtime shows a claim QR regardless.
BASE_URL="$(printf '%s' "${GLANCEOS_URL:-http://glanceos.local:8080}" | sed 's:/*$::')"

# --- 1. Launcher + unit (verbatim copies of the canonical scripts) ----------
install -v -m 0755 "${LAUNCHER_SRC}" "${ROOTFS_DIR}/usr/local/bin/glanceos-start-kiosk"
install -v -m 0644 "${UNIT_SRC}"     "${ROOTFS_DIR}/etc/systemd/system/glanceos-kiosk.service"
# The unit ships User=pi; point it at this image's first user.
sed -i "s/^User=.*/User=${KIOSK_USER}/" "${ROOTFS_DIR}/etc/systemd/system/glanceos-kiosk.service"

# --- 2. Host-URL env file (single source of truth, editable post-flash) -----
cat > "${ROOTFS_DIR}/etc/glanceos-kiosk.env" <<EOF
# GlanceOS kiosk configuration. Point this at your server, then reboot (or
# 'sudo systemctl restart glanceos-kiosk'). Base URL only — no trailing slash,
# no /screen path.
GLANCEOS_URL=${BASE_URL}
EOF
chmod 0644 "${ROOTFS_DIR}/etc/glanceos-kiosk.env"

# --- 3. Disable console/framebuffer blanking (kernel cmdline) ---------------
# cmdline.txt MUST stay a single line; append in place with no newline.
CMDLINE="${ROOTFS_DIR}/boot/firmware/cmdline.txt"
[ -f "${CMDLINE}" ] || CMDLINE="${ROOTFS_DIR}/boot/cmdline.txt"
if [ -f "${CMDLINE}" ] && ! grep -q 'consoleblank=0' "${CMDLINE}"; then
	sed -i 's/[[:space:]]*$//; s/$/ consoleblank=0/' "${CMDLINE}"
fi

# --- 4. Console autologin for the kiosk user on tty1 ------------------------
# Same effect as 'raspi-config nonint do_boot_behaviour B2', written directly so
# it works on the Lite base (raspi-config may be absent). The kiosk unit owns
# tty1 (TTYVHangup) once the session is up.
install -d "${ROOTFS_DIR}/etc/systemd/system/getty@tty1.service.d"
cat > "${ROOTFS_DIR}/etc/systemd/system/getty@tty1.service.d/autologin.conf" <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${KIOSK_USER} --noclear %I \$TERM
EOF

# --- 5. Enable the kiosk + make graphical.target the boot target ------------
# The unit is WantedBy=graphical.target; cage provides the session, so no
# display-manager is needed even though we boot to graphical.target.
on_chroot <<'CHROOT'
systemctl enable glanceos-kiosk.service
systemctl set-default graphical.target
CHROOT

echo "stage-glanceos: kiosk installed (user=${KIOSK_USER}, url=${BASE_URL})"
