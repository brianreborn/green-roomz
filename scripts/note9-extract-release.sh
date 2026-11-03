#!/usr/bin/env bash
# SD-31: safe extraction of the Note9 release tarball (run AFTER checking its sha256 = T).
# Usage: bash note9-extract-release.sh <tarball> <dest>
#   - GNU tar only: $PREFIX/bin/tar on Termux (toybox/busybox tar refused);
#   - lists first (tar -tvzf): refuses absolute paths, any '..' component, and any entry that
#     is not a regular file (symlinks, hardlinks, devices, fifos); git archive's parent dir
#     entries are allowed only as prefixes of listed files;
#   - <dest> must not exist; it is created fresh, mode 0700; extracts with --no-same-owner.
set -euo pipefail
umask 077
die() { echo "ERROR: $*" >&2; exit 1; }
T=${1:?tarball}; DEST=${2:?dest}
[[ -f $T && ! -L $T ]] || die "$T is not a regular file"
if [[ -n ${PREFIX:-} ]]; then TAR=$PREFIX/bin/tar; else TAR=tar; fi
[[ -x $TAR ]] || command -v "$TAR" >/dev/null 2>&1 || die "$TAR missing (pkg install tar)"
"$TAR" --version 2>/dev/null | head -1 | grep -q 'GNU tar' \
  || die "$TAR is not GNU tar (toybox/busybox refused); pkg install tar"
names=$("$TAR" -tzf "$T") || die "cannot list $T"
[[ -n $names ]] || die "$T is empty"
while IFS= read -r n; do
  [[ $n == /* ]] && die "absolute path in tarball: $n; refusing"
  [[ /$n/ == */../* ]] && die "'..' in tarball path: $n; refusing"
done <<< "$names"
# git archive emits parent directory entries; a 'd' entry is allowed only as a prefix of a
# listed regular file. Everything else that is not a regular file is refused.
types=$("$TAR" -tvzf "$T") || die "cannot list $T"
while IFS= read -r l; do
  case ${l:0:1} in
    -) ;;
    d) dn=${l##* }; ok=0
       [[ $dn == */ ]] && while IFS= read -r n; do [[ $n == "$dn"?* && $n != */ ]] && { ok=1; break; }; done <<< "$names"
       (( ok == 1 )) || die "unexpected directory entry in tarball: $l; refusing" ;;
    *) die "non-regular entry in tarball: $l; refusing" ;;
  esac
done <<< "$types"
[[ -e $DEST || -L $DEST ]] && die "$DEST already exists; extract into a fresh folder"
mkdir -m 700 -- "$DEST"
"$TAR" -xzf "$T" -C "$DEST" --no-same-owner --no-same-permissions --no-overwrite-dir
bad=$(find "$DEST" -mindepth 1 ! -type f ! -type d -print -quit)
[[ -z $bad ]] || die "non-regular file after extract: $bad; refusing"
echo "extracted $T -> $DEST (0700)"
