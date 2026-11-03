#!/usr/bin/env bash
# Copy the staged native runtime and JS tree into ONE versioned folder under $HOME, verifying
# every file, then flip $HOME/grz.current to it.
# Usage: bash note9-verify-runtime.sh <stage_root> <tree_src>
#   stage_root  staged runtime root (device: /data/local/tmp/grz; bin/ lib/ models/). Never executed.
#   tree_src    staged JS tree (device: /data/local/tmp/grz/green-roomz)
# Layout: $HOME/grz.<manifest-sha>/{runtime,tree,.verified}; $HOME/grz.current -> grz.<sha>
#   (the only symlink allowed; flipped by ln -s tmp + GNU mv -T, never mv --exchange).
# User state (.git, local config, 0600 override) lives in $HOME/.green-roomz-state (700) and is
# never copied into the versioned folder. Anything executed (node_modules, *.node) must be in
# the hashed tree and listed.
# Manifest (sha256sum format): <tree>/config/note9-runtime.SHA256SUMS, from the staged tree,
#   verified inside the temp dir. Plain entries are relative to runtime/ (bin/llama-server,
#   bin/libggml.so, models/x.gguf); "tree/" entries are relative to tree/.
# Trust anchor: GRZ_MANIFEST_SHA256 (operator-supplied out of band) must equal sha256(manifest).
# Install lock: mkdir $HOME/.grz-install.lock (SD-24); a lock whose pid is dead is taken over.
# Startup sweep (SD-20): only real dirs named grz.<64hex>.old.<n>, grz.unverified.<t>.<p>.old.<n>
#   or .grz-verify.XXXXXX (ours);
#   never a bare *.old.*, never a symlink.
# Same sha already current and intact (SD-25): no copy, no flip.
# After the flip: keep current + the previous one named by the install record
#   $HOME/.green-roomz-state/install-history (SD-24; never by mtime); other grz.* dirs removed.
# $HOME (realpath) on Android shared storage is refused (SD-21, scripts/note9-shared-storage.sh).
# Aborts on: unlisted or symlinked staged file, missing/empty manifest, copy failure, hash
# mismatch, non-symlink grz.current, or non-GNU realpath/find/mv ahead in PATH.
# Only escape: GRZ_ALLOW_UNVERIFIED_RUNTIME=1 (loud warning; folder grz.unverified.*, no
# .verified, the runner still refuses unless it is given the same escape).
set -euo pipefail
umask 077
_grz_vdir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=note9-shared-storage.sh
source "$_grz_vdir/note9-shared-storage.sh"
STAGE=${1:?stage root}; TSRC=${2:?tree src}
MAN_REL=config/note9-runtime.SHA256SUMS
die() { echo "ERROR: $*" >&2; exit 1; }

# Tools: toybox realpath/find (/system/bin) lack -e / -print0 semantics we rely on.
if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/realpath ]]; then REALPATH=$PREFIX/bin/realpath; else REALPATH=realpath; fi
if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/find ]]; then FIND=$PREFIX/bin/find; else FIND="find"; fi
"$REALPATH" --version 2>/dev/null | grep -q coreutils \
  || die "realpath is not GNU coreutils ($(command -v "$REALPATH" || echo missing)); put Termux \$PREFIX/bin first in PATH (pkg install coreutils)"
if [[ -n ${PREFIX:-} && -x ${PREFIX}/bin/mv ]]; then MV=$PREFIX/bin/mv; else MV="mv"; fi
"$MV" --version 2>/dev/null | grep -q coreutils \
  || die "mv is not GNU coreutils (need mv -T); put Termux \$PREFIX/bin first in PATH"
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

# npm-deps: none (package.json has no runtime deps): any node_modules dir is refused.
if [[ -d $TSRC ]]; then
  nm=$("$FIND" "$TSRC" -name node_modules -not -path '*/.git/*' -print -quit)
  [[ -z $nm ]] || die "node_modules present in staged tree ($nm); npm-deps: none; refusing"
fi
[[ -n ${HOME:-} && -d $HOME ]] || die "HOME unset or missing"
HOME_REAL=$("$REALPATH" -e -- "$HOME")
CUR=$HOME_REAL/grz.current
if [[ -e $CUR || -L $CUR ]]; then
  [[ -L $CUR ]] || die "$CUR exists and is not a symlink; refusing"
fi
grz_is_shared_storage "$HOME_REAL" && die "HOME $HOME_REAL is on shared storage; refusing"
STATE=$HOME_REAL/.green-roomz-state
[[ -L $STATE ]] && die "$STATE is a symlink; refusing"
[[ -d $STATE ]] || mkdir -m 700 -- "$STATE" || die "cannot create $STATE"
HIST=$STATE/install-history
# SD-24/SD-26: one install at a time. mkdir is the atomic acquire. A held lock with a live or
# EMPTY pid (owner may not have written it yet) is refused; a dead pid's lock is renamed aside
# atomically (mv -T) before a fresh mkdir, so two takers cannot both win.
LOCK=$HOME_REAL/.grz-install.lock
if ! mkdir -m 700 -- "$LOCK" 2>/dev/null; then
  [[ -L $LOCK || ! -d $LOCK ]] && die "$LOCK is not a plain directory; refusing"
  owner=$(cat -- "$LOCK/pid" 2>/dev/null || true)
  [[ -n $owner ]] || die "$LOCK held (pid not written yet); refusing"
  [[ $owner =~ ^[0-9]+$ ]] || die "$LOCK has a bad pid '$owner'; refusing"
  kill -0 "$owner" 2>/dev/null && die "another install (pid $owner) holds $LOCK; refusing"
  ASIDE=$HOME_REAL/.grz-install.lock.stale.$$
  "$MV" -T -- "$LOCK" "$ASIDE" 2>/dev/null || die "lost the race to take over $LOCK; refusing"
  # SD-30: the dir we moved must still be the dead owner's lock (not one re-taken in between).
  moved=$(cat -- "$ASIDE/pid" 2>/dev/null || true)
  if [[ $moved != "$owner" ]]; then
    "$MV" -T -- "$ASIDE" "$LOCK" 2>/dev/null || true
    die "lock changed hands during takeover (pid '$owner' -> '$moved'); refusing"
  fi
  echo "taking over stale lock $LOCK (pid $owner gone)" >&2
  rm -rf -- "$ASIDE"
  mkdir -m 700 -- "$LOCK" 2>/dev/null || die "another install took $LOCK first; refusing"
fi
echo $$ > "$LOCK/pid"
WORK=""
# shellcheck disable=SC2329 # invoked via trap
cleanup() { if [[ -n ${WORK:-} ]]; then rm -rf -- "$WORK"; fi; rm -rf -- "$LOCK"; }
trap cleanup EXIT
# SD-20: sweep only our own leftovers, real dirs only.
shopt -s nullglob
for stale in "$HOME_REAL"/grz.*.old.* "$HOME_REAL"/.grz-verify.*; do
  n=${stale##*/}
  [[ -d $stale && ! -L $stale ]] || continue
  [[ $n =~ ^grz\.([0-9a-f]{64}|unverified\.[0-9]+\.[0-9]+)\.old\.[0-9]+$ || $n =~ ^\.grz-verify\.[A-Za-z0-9]{6}$ ]] || continue
  echo "sweeping stale $stale" >&2; rm -rf -- "$stale"
done
shopt -u nullglob
WORK=$(mktemp -d "$HOME_REAL/.grz-verify.XXXXXX") || die "mktemp under $HOME failed"
chmod 700 "$WORK"
NRT=$WORK/runtime; NTREE=$WORK/tree
mkdir -p "$NRT/bin" "$NRT/lib" "$NRT/models" "$NTREE/config"

# copy src -> temp dst. Every result is re-hashed and re-chmodded below.
copy() { # src dst
  mkdir -p "$(dirname -- "$2")"
  cp -- "$1" "$2" || die "copy of $1 failed; refusing (no fallback into $STAGE)"
}

[[ -f $TSRC/$MAN_REL ]] && copy "$TSRC/$MAN_REL" "$NTREE/$MAN_REL"
SUMS=""; SUMS_IN=$NTREE/$MAN_REL
[[ -f $SUMS_IN && ! -L $SUMS_IN ]] && SUMS=$SUMS_IN

declare -A listed=()
ACTUAL=""
if [[ -z $SUMS ]]; then
  unverified "manifest $SUMS_IN missing"
else
  ACTUAL=$(sha256sum < "$SUMS" | cut -d' ' -f1)
  echo "manifest $SUMS sha256=$ACTUAL"
  # SD-29 (before the anchor, no escape hatch): a DRYRUN manifest or one without a models/ line
  # is never installed.
  grep -q '^# DRYRUN' -- "$SUMS" && die "manifest $SUMS is a DRYRUN manifest (gen-manifest --allow-no-model); refusing"
  # Boundary nit: a manifest with no hash lines at all lists nothing and verifies nothing.
  grep -qE '^[0-9a-f]{64} [ *]?[^#]' -- "$SUMS" || die "manifest $SUMS has no hash lines; refusing"
  grep -qE '^[0-9a-f]{64} [ *]?\*?models/' -- "$SUMS" || die "manifest $SUMS has no models/ line; refusing"
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

# SD-25: same verified sha already live and intact -> nothing to copy or flip.
if [[ $UNVERIFIED == 0 && -L $CUR && $(readlink -- "$CUR") == "grz.$ACTUAL" ]]; then
  LIVE=$HOME_REAL/grz.$ACTUAL
  if [[ -d $LIVE && ! -L $LIVE && $(cat -- "$LIVE/.verified" 2>/dev/null) == "$ACTUAL" ]]; then
    ok=1
    for p in "${!listed[@]}"; do
      if [[ $p == tree/* ]]; then dst=$LIVE/tree/${p#tree/}; else dst=$LIVE/runtime/$p; fi
      want=$(awk -v p="$p" '($2==p||$2=="*"p)&&$1!~/^#/{print $1; exit}' "$SUMS")
      [[ ! -L $dst && $(sha256sum -- "$dst" 2>/dev/null | cut -d' ' -f1) == "$want" ]] || { ok=0; break; }
    done
    # Nothing unlisted, no symlinks, exec bits intact.
    nlive=$("$FIND" "$LIVE/runtime" "$LIVE/tree" \( -type f -o -type l \) -not -path "$LIVE/tree/$MAN_REL" -printf x | wc -c)
    [[ $nlive == "${#listed[@]}" ]] || ok=0
    for b in "$LIVE"/runtime/bin/llama-server "$LIVE"/runtime/bin/llama-cli "$LIVE"/runtime/bin/llama-bench "$LIVE"/tree/scripts/note9-run-llama-server.termux.sh; do
      [[ ! -f $b || $(stat -c %a -- "$b") == 755 ]] || ok=0
    done
    if [[ $ok == 1 ]]; then
      echo "grz.$ACTUAL already current and intact; skipping copy and flip"
      exit 0
    fi
    echo "grz.$ACTUAL is current but does not re-verify; reinstalling" >&2
  fi
fi

n=0
check_listed() { [[ $UNVERIFIED == 1 || -n ${listed[$1]:-} ]] || die "staged file $1 is not listed in the manifest; refusing"; }
while IFS= read -r -d '' f; do
  rel=${f#"$STAGE"/}; check_listed "$rel"; copy "$f" "$NRT/$rel"; n=$((n+1))
done < <("$FIND" "$STAGE/bin" "$STAGE/lib" "$STAGE/models" -type f -print0 2>/dev/null)
if [[ -d $TSRC ]]; then
  while IFS= read -r -d '' f; do
    rel=${f#"$TSRC"/}; [[ $rel == "$MAN_REL" ]] && continue
    check_listed "tree/$rel"; copy "$f" "$NTREE/$rel"; n=$((n+1))
  done < <("$FIND" "$TSRC" -type f -not -path '*/.git/*' -not -path '*/.green-roomz-state/*' -not -name '*.local.json' -print0)
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
  (( fail == 0 )) || die "checksum mismatch against $SUMS; refusing (grz.current untouched)"
  echo "verified ${#listed[@]} files against $SUMS"
  printf '%s\n' "$ACTUAL" > "$WORK/.verified"
fi
# Exec bits after verification, on every path (fresh copy and cmp-skip alike).
for b in "$NRT"/bin/llama-server "$NRT"/bin/llama-cli "$NRT"/bin/llama-bench; do
  [[ -f $b ]] && chmod 755 "$b"
done
# The cut runner is the manifest's runtime command: executable, from the hashed tree only.
[[ -f $NTREE/scripts/note9-run-llama-server.termux.sh ]] && chmod 755 "$NTREE/scripts/note9-run-llama-server.termux.sh"

if [[ $UNVERIFIED == 0 ]]; then NAME=grz.$ACTUAL; else NAME=grz.unverified.$(date +%s).$$; fi
DEST=$HOME_REAL/$NAME
if [[ -e $DEST || -L $DEST ]]; then
  "$MV" -T -- "$DEST" "$DEST.old.$$" || die "cannot move aside $DEST"
fi
"$MV" -T -- "$WORK" "$DEST" || die "cannot place $DEST"
WORK=""
chmod 700 "$DEST"
TMPL=$HOME_REAL/.grz-current.tmp.$$
ln -s -- "$NAME" "$TMPL" || die "ln -s $TMPL failed"
"$MV" -T -- "$TMPL" "$CUR" || { rm -f -- "$TMPL"; die "flip of $CUR failed; previous current kept"; }
rm -rf -- "$DEST.old.$$"
# SD-24: record the install, keep current + the previous recorded name; never mtime.
[[ -L $HIST ]] && die "$HIST is a symlink; refusing"
printf '%s\n' "$NAME" >> "$HIST"; chmod 600 "$HIST"
prev=$(awk -v cur="$NAME" '$0!=cur{p=$0} END{print p}' "$HIST")
for c in "$HOME_REAL"/grz.*; do
  n=${c##*/}
  [[ -d $c && ! -L $c ]] || continue
  [[ $n =~ ^grz\.([0-9a-f]{64}|unverified\.[0-9]+\.[0-9]+)$ ]] || continue
  [[ $n == "$NAME" || ( -n $prev && $n == "$prev" ) ]] && continue
  echo "sweeping old $c" >&2; rm -rf -- "$c"
done
# Trim the record to its last 20 lines (tmp + rename in the 700 state dir).
tail -n 20 -- "$HIST" > "$HIST.tmp.$$" && chmod 600 "$HIST.tmp.$$" && "$MV" -T -- "$HIST.tmp.$$" "$HIST"
echo "installed $DEST; $CUR -> $NAME"
exit 0
