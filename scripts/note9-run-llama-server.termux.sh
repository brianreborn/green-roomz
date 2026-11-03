#!/usr/bin/env bash
# Portable shebang. Invoke as: bash note9-run-llama-server.termux.sh [llama-server args]
# Under Termux: runs the $HOME/grz-runtime copy (SELinux denies exec from /data/local/tmp).
# Under adb shell (uid shell, no $PREFIX): legacy /data/local/tmp path, adb-only.
set -eu
: "${LANG:=C.UTF-8}"; export LANG
is_termux=0
[ -n "${TERMUX_VERSION:-}" ] && is_termux=1
case "${PREFIX:-}" in */files/usr) is_termux=1 ;; esac
if [ "$is_termux" = 1 ]; then
  RT="$HOME/grz-runtime"
  if [ ! -x "$RT/bin/llama-server" ]; then
    echo "ERROR: $RT/bin/llama-server missing or not executable. Run note9-termux-setup.sh first;" >&2
    echo "       /data/local/tmp/grz/bin is adb-only (SELinux denies exec from Termux)." >&2
    exit 1
  fi
  export LD_LIBRARY_PATH="$RT/lib:$RT/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  cd "$RT"
  exec "$RT/bin/llama-server" "$@"
fi
# adb-only path
export LD_LIBRARY_PATH="/data/local/tmp/grz/lib:/data/local/tmp/grz/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd /data/local/tmp/grz
exec /data/local/tmp/grz/bin/llama-server "$@"
