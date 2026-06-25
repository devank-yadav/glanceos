#!/bin/bash -e
# pi-gen stage prerun: start this stage from a copy of the previous stage's
# rootfs (the standard pi-gen idiom). Everything the kiosk needs is layered on
# top in the sub-stages below — we never modify the base stages.
if [ ! -d "${ROOTFS_DIR}" ]; then
	copy_previous
fi
