#!/usr/bin/env bash
# Copy the staged native runtime and JS tree into $HOME, verifying every file.
# Usage: bash note9-verify-runtime.sh <stage_root> <tree_src> <runtime_dir> <tree_dir>
#   stage_root  staged runtime root (device: /data/local/tmp/grz; bin/ lib/ models/). Never executed.
#   tree_src    staged JS tree (device: /data/local/tmp/grz/green-roomz)
#   runtime_dir destination for the runtime ($HOME/grz-runtime)
#   tree_dir    destination JS tree, the cut ($HOME/green-roomz)
# Manifest (sha256sum format): $GRZ_RUNTIME_SUMS or <tree_dir>/config/note9-runtime.SHA256SUMS
# (the staged copy is verified inside the temp dir, then swapped in with the tree).
#   Plain entries are relative to runtime_dir (bin/llama-server, bin/libggml.so, models/x.gguf).
#   Entries prefixed "tree/" are relative to tree_dir (tree/src/gateway.mjs).
# Trust anchor: GRZ_MANIFEST_SHA256 (operator-supplied out of band) must equal sha256(manifest).
# Flow: build both trees in a fresh mktemp -d under $HOME (mode 700), verify there, then
# swap into place (rename old -> mv new -> rm old). Any failure removes the temp dir and
# leaves the live runtime/tree untouched. Files in the live tree not in the manifest are
# gone after the swap. On success $RT/.verified holds the manifest sha256 (runner checks it).
# Aborts on: unlisted or symlinked staged file, missing/empty/out-of-tree manifest, copy
# failure, hash mismatch, or non-Termux/toybox realpath/find ahead in PATH.
# Only escape: GRZ_ALLOW_UNVERIFIED_RUNTIME=1 (loud warning, copies everything, no .verified).
set -euo pipefail
umask 077
STAGE=${1:?stage root}; TSRC=${2:?tree src}; RT=${3:?runtime dir}; TREE=${4:?tree dir}
MAN_REL=config/note9-runtime.SHA256SUMS
die() { echo "ERROR: $*" >&2; exit 1; }

# Tools: toybox realpath/find (/system/bin) lack -e / -print0 semantics we rely on.
if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/realpath ]]; then REALPATH=$PREFIX/bin/realpath; else REALPATH=realpath; fi
if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/find ]]; then FIND=$PREFIX/bin/find; else FIND="find"; fi
"$REALPATH" --version 2>/dev/null | grep -q coreutils \
  || die "realpath is not GNU coreutils ($(command -v "$REALPATH" || echo missing)); put Termux \$PREFIX/bin first in PATH (pkg install coreutils)"
"$FIND" --version 2>/dev/null | grep -q findutils \
  || die "find is not GNU findutils ($(command -v "$FIND" || echo missing)); put Termux \$PREFIX/bin first in PATH (pkg install findutils)"

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

# Refuse staged symlinks loudly (find -type f would silently skip them).
for d in "$STAGE/bin" "$STAGE/lib" "$STAGE/models" "$TSRC"; do
  [[ -L $d ]] && die "staged path $d is a symlink; refusing"
  [[ -d $d ]] || continue
  link=$("$FIND" "$d" -type l -print -quit)
  [[ -z $link ]] || die "staged symlink $link; refusing (symlinks are never installed)"
done

[[ -n ${HOME:-} && -d $HOME ]] || die "HOME unset or missing"
WORK=$(mktemp -d "$HOME/.grz-verify.XXXXXX") || die "mktemp under $HOME failed"
chmod 700 "$WORK"
# shellcheck disable=SC2329 # invoked via trap
cleanup() { [[ -n ${WORK:-} ]] && rm -rf -- "$WORK"; }
trap cleanup EXIT
NRT=$WORK/rt; NTREE=$WORK/tree
mkdir -p "$NRT/bin" "$NRT/lib" "$NRT/models" "$NTREE/config"

# copy src -> temp dst. If the live file is byte-identical, copy from the live tree
# (the cmp-skip path); either way the result is re-hashed and re-chmodded below.
copy() { # src dst live
  mkdir -p "$(dirname -- "$2")"
  if [[ -f $3 && ! -L $3 ]] && cmp -s -- "$1" "$3"; then src=$3; else src=$1; fi
  cp -- "$src" "$2" || die "copy of $1 failed; refusing (no fallback into $STAGE)"
}

[[ -f $TSRC/$MAN_REL ]] && copy "$TSRC/$MAN_REL" "$NTREE/$MAN_REL" "$TREE/$MAN_REL"
NTREE_REAL=$("$REALPATH" -e -- "$NTREE")
TREE_REAL=""; [[ -d $TREE ]] && TREE_REAL=$("$REALPATH" -e -- "$TREE")
SUMS_IN=${GRZ_RUNTIME_SUMS:-$NTREE_REAL/$MAN_REL}
SUMS=""
if SUMS_REAL=$("$REALPATH" -e -- "$SUMS_IN" 2>/dev/null) && [[ -f $SUMS_REAL ]]; then
  case "$SUMS_REAL" in
    /data/local/tmp/*|/sdcard/*|/storage/*|/mnt/sdcard/*) die "manifest $SUMS_REAL is on adb/shared storage; refusing" ;;
  esac
  [[ $SUMS_REAL == "$NTREE_REAL"/* || ( -n $TREE_REAL && $SUMS_REAL == "$TREE_REAL"/* ) ]] \
    || die "manifest $SUMS_REAL is outside the cut tree $TREE; refusing"
  SUMS=$SUMS_REAL
fi

declare -A listed=()
ACTUAL=""
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
while IFS= read -r -d '' f; do
  rel=${f#"$STAGE"/}; check_listed "$rel"; copy "$f" "$NRT/$rel" "$RT/$rel"; n=$((n+1))
done < <("$FIND" "$STAGE/bin" "$STAGE/lib" "$STAGE/models" -type f -print0 2>/dev/null)
if [[ -d $TSRC ]]; then
  while IFS= read -r -d '' f; do
    rel=${f#"$TSRC"/}; [[ $rel == "$MAN_REL" ]] && continue
    check_listed "tree/$rel"; copy "$f" "$NTREE/$rel" "$TREE/$rel"; n=$((n+1))
  done < <("$FIND" "$TSRC" -type f -not -path '*/.git/*' -print0)
fi
echo "copied $n staged files"

if [[ $UNVERIFIED == 0 ]]; then
  fail=0
  for p in "${!listed[@]}"; do
    if [[ $p == tree/* ]]; then dst=$NTREE/${p#tree/}; else dst=$NRT/$p; fi
    want=$(awk -v p="$p" '($2==p||$2=="*"p)&&$1!~/^#/{print $1; exit}' "$SUMS")
    got=$(sha256sum -- "$dst" 2>/dev/null | cut -d' ' -f1) || got=""
    if [[ $got != "$want" ]]; then echo "FAILED: $p" >&2; fail=1; fi
  done
  (( fail == 0 )) || die "checksum mismatch against $SUMS; refusing (live tree untouched)"
  echo "verified ${#listed[@]} files against $SUMS"
  printf '%s\n' "$ACTUAL" > "$NRT/.verified"
fi
# Exec bits after verification, on every path (fresh copy and cmp-skip alike).
for b in "$NRT"/bin/llama-server "$NRT"/bin/llama-cli "$NRT"/bin/llama-bench; do
  [[ -f $b ]] && chmod 755 "$b"
done

swap() { # new live
  local new=$1 live=$2 old=""
  mkdir -p "$(dirname -- "$live")"
  if [[ -e $live || -L $live ]]; then old="$live.old.$$"; mv -- "$live" "$old" || die "cannot move aside $live"; fi
  if ! mv -- "$new" "$live"; then
    [[ -n $old ]] && mv -- "$old" "$live"
    die "swap into $live failed; previous tree restored"
  fi
  [[ -n $old ]] && rm -rf -- "$old"
  return 0
}
swap "$NRT" "$RT"
swap "$NTREE" "$TREE"
echo "installed runtime $RT and tree $TREE"
exit 0
