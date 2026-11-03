#!/usr/bin/env bash
# Portable shebang. Invoke as: bash note9-run-llama-server.termux.sh [llama-server args]
# Under Termux: runs the verified $HOME/grz-runtime copy only. Refuses unless
#   - $RT/.verified exists and equals sha256 of the cut manifest (and GRZ_MANIFEST_SHA256 if set),
#   - every bin/*.so and models/* file in $RT is listed in that manifest.
#   LD_LIBRARY_PATH is set to exactly "$RT/bin" (caller value discarded).
# adb-only legacy /data/local/tmp path: UNVERIFIED, requires GRZ_ADB_DEBUG=1.
set -eu
: "${LANG:=C.UTF-8}"; export LANG
die() { echo "ERROR: $*" >&2; exit 1; }
is_termux=0
[ -n "${TERMUX_VERSION:-}" ] && is_termux=1
case "${PREFIX:-}" in */files/usr) is_termux=1 ;; esac
if [ "$is_termux" = 1 ]; then
  RT="${GRZ_RUNTIME_DIR:-$HOME/grz-runtime}"
  MAN="${GRZ_TREE_DIR:-$HOME/green-roomz}/config/note9-runtime.SHA256SUMS"
  [ -x "$RT/bin/llama-server" ] || die "$RT/bin/llama-server missing or not executable. Run note9-termux-setup.sh first; /data/local/tmp/grz/bin is adb-only (SELinux denies exec from Termux)."
  [ -f "$RT/.verified" ] || die "$RT/.verified missing; runtime not verified. Re-run note9-termux-setup.sh with GRZ_MANIFEST_SHA256."
  [ -f "$MAN" ] || die "manifest $MAN missing; refusing"
  stamp=$(tr -d '[:space:]' < "$RT/.verified")
  cur=$(sha256sum < "$MAN" | cut -d' ' -f1)
  [ "$stamp" = "$cur" ] || die "$RT/.verified ($stamp) does not match manifest sha256 ($cur); refusing"
  if [ -n "${GRZ_MANIFEST_SHA256:-}" ] && [ "${GRZ_MANIFEST_SHA256,,}" != "$stamp" ]; then
    die "$RT/.verified ($stamp) does not match GRZ_MANIFEST_SHA256; refusing"
  fi
  declare -A listed=()
  while read -r h p; do
    case "${h:-}" in ''|\#*) continue ;; esac
    listed[${p#\*}]=1
  done < "$MAN"
  shopt -s nullglob
  for f in "$RT"/bin/*.so "$RT"/bin/*.so.* "$RT"/models/*; do
    rel=${f#"$RT"/}
    [ -n "${listed[$rel]:-}" ] || die "$rel is not listed in $MAN; refusing to start"
  done
  export LD_LIBRARY_PATH="$RT/bin"
  cd "$RT"
  exec "$RT/bin/llama-server" "$@"
fi
# adb-only path: unverified, debug only.
[ "${GRZ_ADB_DEBUG:-0}" = 1 ] || die "not under Termux; the adb /data/local/tmp runtime is UNVERIFIED. Set GRZ_ADB_DEBUG=1 to run it anyway (debug only)."
echo "!! WARNING: GRZ_ADB_DEBUG=1 — running UNVERIFIED runtime from writable /data/local/tmp/grz" >&2
export LD_LIBRARY_PATH="/data/local/tmp/grz/bin"
cd /data/local/tmp/grz
exec /data/local/tmp/grz/bin/llama-server "$@"
