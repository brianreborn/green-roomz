#!/bin/sh
# Boot the try VM. Forwards host :8080 -> guest :8080 and :2222 -> guest :22.
set -eu
DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
DISK="${DISK:-$DIR/green-roomz.qcow2}"
SEED="${SEED:-$DIR/seed.iso}"
MEM="${MEM:-4096}"
exec qemu-system-x86_64 \
  -machine type=q35,accel=kvm:tcg \
  -m "$MEM" -smp 2 \
  -drive "file=$DISK,if=virtio,format=qcow2" \
  -drive "file=$SEED,media=cdrom,readonly=on" \
  -nic user,model=virtio,hostfwd=tcp::8080-:8080,hostfwd=tcp::2222-:22 \
  -nographic
