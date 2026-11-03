#!/usr/bin/env bash
# Build the Note9 release bootstrap tarball: everything setup executes before verification
# (setup, verifier, sourced helpers, shared-storage list) plus the manifest, in ONE file.
# Deterministic: sorted entries, mtime 0, uid/gid 0, fixed modes, gzip -n.
# Usage: bash scripts/note9-pack-release.sh [out.tar.gz]   (default dist/grz-note9-release.tar.gz)
# Prints the tarball sha256 and the manifest sha256 (GRZ_MANIFEST_SHA256); publish them together.
# Brian checks the tarball sha256 on the device before extracting or running anything.
# Local only: never uploads, pushes or publishes.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
OUT=${1:-$ROOT/dist/grz-note9-release.tar.gz}
FILES=(
  config/note9-runtime.SHA256SUMS
  config/shared-storage-prefixes.txt
  scripts/note9-common.sh
  scripts/note9-shared-storage.sh
  scripts/note9-termux-setup.sh
  scripts/note9-verify-runtime.sh
)
for f in "${FILES[@]}"; do
  [[ -f $ROOT/$f && ! -L $ROOT/$f ]] || { echo "ERROR: $f missing or a symlink" >&2; exit 1; }
done
tar --version 2>/dev/null | grep -q 'GNU tar' || { echo "ERROR: GNU tar required" >&2; exit 1; }
mkdir -p -- "$(dirname -- "$OUT")"
TMP=$OUT.tmp.$$
trap 'rm -f -- "$TMP"' EXIT
mapfile -t SORTED < <(printf '%s\n' "${FILES[@]}" | LC_ALL=C sort)
tar -C "$ROOT" --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
    --mode='u=rw,go=r' --format=gnu --no-recursion -cf - -- "${SORTED[@]}" | gzip -n -9 > "$TMP"
mv -f -- "$TMP" "$OUT"
TSHA=$(sha256sum < "$OUT" | cut -d' ' -f1)
MSHA=$(sha256sum < "$ROOT/config/note9-runtime.SHA256SUMS" | cut -d' ' -f1)
echo "tarball  $OUT"
echo "tarball  sha256=$TSHA"
echo "manifest sha256=$MSHA  (GRZ_MANIFEST_SHA256)"
