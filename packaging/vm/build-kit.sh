#!/bin/sh
# Build a bootable VM kit: Debian cloud qcow2 + cloud-init seed ISO.
# Intended for GitHub Actions / a Linux builder (not qodesh).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/../dist/vm}"
DEBIAN_URL="${DEBIAN_URL:-https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2}"
mkdir -p "$OUT"
echo "downloading Debian genericcloud..."
curl -fL --retry 3 -o "$OUT/debian-base.qcow2" "$DEBIAN_URL"
qemu-img convert -O qcow2 "$OUT/debian-base.qcow2" "$OUT/green-roomz.qcow2"
rm -f "$OUT/debian-base.qcow2"
qemu-img resize "$OUT/green-roomz.qcow2" 8G
cloud-localds "$OUT/seed.iso" "$ROOT/cloud-init/user-data" "$ROOT/cloud-init/meta-data"
cp "$ROOT/vm/README.md" "$OUT/README.md"
cp "$ROOT/vm/run-qemu.sh" "$OUT/run-qemu.sh"
chmod +x "$OUT/run-qemu.sh"
( cd "$OUT" && tar -czf green-roomz-vm-kit.tar.gz green-roomz.qcow2 seed.iso README.md run-qemu.sh )
ls -lh "$OUT"
echo "kit: $OUT/green-roomz-vm-kit.tar.gz"
