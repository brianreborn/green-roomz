#!/usr/bin/env bash
# Copy the staged native runtime and JS tree into $HOME, verifying every file.
# Usage: bash note9-verify-runtime.sh <stage_root> <tree_src> <runtime_dir> <tree_dir>
#   stage_root  staged runtime root (device: /data/local/tmp/grz; bin/ lib/ models/). Never executed.
#   tree_src    staged JS tree (device: /data/local/tmp/grz/green-roomz)
#   runtime_dir destination for the runtime ($HOME/grz-runtime)
#   tree_dir    destination JS tree, the cut ($HOME/green-roomz)
# Manifest (sha256sum format): $GRZ_RUNTIME_SUMS or <tree_dir>/config/note9-runtime.SHA256SUMS.
#   Plain entries are relative to runtime_dir (bin/llama-server, lib/x.so, models/x.gguf).
#   Entries prefixed "tree/" are relative to tree_dir (tree/src/gateway.mjs).
# Trust anchor: GRZ_MANIFEST_SHA256 (operator-supplied out of band) must equal sha256(manifest).
# Only listed files are copied; any staged file not listed aborts. Also aborts on a
# missing/empty/out-of-tree manifest, failed copy or hash mismatch.
# Only escape: GRZ_ALLOW_UNVERIFIED_RUNTIME=1 (loud warning, copies everything unverified).
set -euo pipefail
umask 077
STAGE=${1:?stage root}; TSRC=${2:?tree src}; RT=${3:?runtime dir}; TREE=${4:?tree dir}
MAN_REL=config/note9-runtime.SHA256SUMS
die() { echo "ERROR: $*" >&2; exit 1; }
UNVERIFIED=0
unverified() {
  if [[ "${GRZ_ALLOW_UNVERIFIED_RUNTIME:-0}" == 1 ]]; then
    {
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo "!! WARNING: GRZ_ALLOW_UNVERIFIED_RUNTIME=1 — $*"
      echo "!! Runtime and JS tree are NOT verified. Anything written to"
      echo "!! $STAGE may be executed as this Termux user."
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    } >&2
    UNVERIFIED=1; return 0
  fi
  die "$*; refusing (GRZ_ALLOW_UNVERIFIED_RUNTIME=1 only with Brian's per-host OK)"
}
copy() { # src dst
  mkdir -p "$(dirname -- "$2")"
  cmp -s -- "$1" "$2" 2>/dev/null || cp -- "$1" "$2" || die "copy of $1 failed; refusing (no fallback into $STAGE)"
}

mkdir -p "$TREE/config" "$RT/bin" "$RT/lib" "$RT/models"
# Bring in only the manifest first; it is anchored by GRZ_MANIFEST_SHA256 before anything else is trusted.
[[ -f $TSRC/$MAN_REL ]] && copy "$TSRC/$MAN_REL" "$TREE/$MAN_REL"
TREE_REAL=$(realpath -e -- "$TREE")
SUMS_IN=${GRZ_RUNTIME_SUMS:-$TREE_REAL/$MAN_REL}
SUMS=""
if SUMS_REAL=$(realpath -e -- "$SUMS_IN" 2>/dev/null) && [[ -f $SUMS_REAL ]]; then
  case "$SUMS_REAL" in
    /data/local/tmp/*|/sdcard/*|/storage/*|/mnt/sdcard/*) die "manifest $SUMS_REAL is on adb/shared storage; refusing" ;;
  esac
  [[ $SUMS_REAL == "$TREE_REAL"/* ]] || die "manifest $SUMS_REAL is outside the cut tree $TREE_REAL; refusing"
  SUMS=$SUMS_REAL
fi

declare -A listed=()
if [[ -z $SUMS ]]; then
  unverified "manifest $SUMS_IN missing"
else
  ACTUAL=$(sha256sum < "$SUMS" | cut -d' ' -f1)
  echo "manifest $SUMS sha256=$ACTUAL"
  if [[ -z ${GRZ_MANIFEST_SHA256:-} ]]; then
    unverified "GRZ_MANIFEST_SHA256 unset (manifest sha256=$ACTUAL)"
  elif [[ ${GRZ_MANIFEST_SHA256,,} != "$ACTUAL" ]]; then
    unverified "manifest sha256=$ACTUAL does not match GRZ_MANIFEST_SHA256=$GRZ_MANIFEST_SHA256"
  fi
  while read -r h p; do
    [[ -z ${h:-} || $h == \#* ]] && continue
    p=${p#\*}
    [[ $h =~ ^[0-9a-f]{64}$ && -n $p ]] || die "bad manifest line in $SUMS: $h $p"
    [[ $p != /* && $p != *..* ]] || die "manifest path escapes its root: $p"
    listed[$p]=1
  done < "$SUMS"
  (( ${#listed[@]} > 0 )) || unverified "manifest $SUMS has no entries (manifest sha256=$ACTUAL)"
fi

n=0
check_listed() { [[ $UNVERIFIED == 1 || -n ${listed[$1]:-} ]] || die "staged file $1 is not listed in the manifest; refusing"; }
# Runtime: bin/ lib/ models/ under stage root.
while IFS= read -r -d '' f; do
  rel=${f#"$STAGE"/}; check_listed "$rel"; copy "$f" "$RT/$rel"; n=$((n+1))
done < <(find "$STAGE/bin" "$STAGE/lib" "$STAGE/models" -type f -print0 2>/dev/null)
# JS tree.
if [[ -d $TSRC ]]; then
  while IFS= read -r -d '' f; do
    rel=${f#"$TSRC"/}; [[ $rel == "$MAN_REL" ]] && continue
    check_listed "tree/$rel"; copy "$f" "$TREE/$rel"; n=$((n+1))
  done < <(find "$TSRC" -type f -not -path '*/.git/*' -print0)
fi
echo "copied $n staged files"

if [[ $UNVERIFIED == 0 ]]; then
  fail=0
  for p in "${!listed[@]}"; do
    if [[ $p == tree/* ]]; then dst=$TREE/${p#tree/}; else dst=$RT/$p; fi
    want=$(awk -v p="$p" '($2==p||$2=="*"p)&&$1!~/^#/{print $1; exit}' "$SUMS")
    got=$(sha256sum -- "$dst" 2>/dev/null | cut -d' ' -f1) || got=""
    if [[ $got != "$want" ]]; then echo "FAILED: $p" >&2; fail=1; fi
  done
  (( fail == 0 )) || die "checksum mismatch against $SUMS; refusing"
  echo "verified ${#listed[@]} files against $SUMS"
fi
for b in "$RT"/bin/llama-server "$RT"/bin/llama-cli "$RT"/bin/llama-bench; do
  [[ -f $b ]] && chmod 700 "$b"
done
exit 0
