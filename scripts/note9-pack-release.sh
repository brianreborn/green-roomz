#!/usr/bin/env bash
# Build the Note9 release bootstrap tarball: everything setup executes before verification
# (setup, verifier, sourced helpers, shared-storage list) plus the manifest, in ONE file.
# Deterministic: git archive of HEAD (refuses a dirty tree), gzip -n.
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
FILES+=(scripts/note9-extract-release.sh)
for f in "${FILES[@]}"; do
  [[ -f $ROOT/$f && ! -L $ROOT/$f ]] || { echo "ERROR: $f missing or a symlink" >&2; exit 1; }
done
command -v git >/dev/null 2>&1 || { echo "ERROR: git required (pack uses git archive of HEAD)" >&2; exit 1; }
git -C "$ROOT" rev-parse --verify -q HEAD >/dev/null || { echo "ERROR: $ROOT is not a git checkout with a HEAD" >&2; exit 1; }
# SD-31: the tarball is exactly HEAD (git archive); a dirty tree is refused.
dirty=$(git -C "$ROOT" status --porcelain --untracked-files=normal -- . ':!dist')
[[ -z $dirty ]] || { echo "ERROR: working tree is dirty; commit or stash first (pack = git archive HEAD):" >&2; echo "$dirty" >&2; exit 1; }
mkdir -p -- "$(dirname -- "$OUT")"
TMP=$OUT.tmp.$$
trap 'rm -f -- "$TMP"' EXIT
mapfile -t SORTED < <(printf '%s\n' "${FILES[@]}" | LC_ALL=C sort)
# git archive: entries in tree order, mtime = HEAD commit time, uid/gid 0, modes from git.
git -C "$ROOT" -c tar.umask=0022 archive --format=tar HEAD -- "${SORTED[@]}" | gzip -n -9 > "$TMP"
mv -f -- "$TMP" "$OUT"
TSHA=$(sha256sum < "$OUT" | cut -d' ' -f1)
MSHA=$(git -C "$ROOT" show HEAD:config/note9-runtime.SHA256SUMS | sha256sum | cut -d' ' -f1)
echo "tarball  $OUT"
echo "tarball  sha256=$TSHA"
echo "manifest sha256=$MSHA  (GRZ_MANIFEST_SHA256)"
