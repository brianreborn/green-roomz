#!/usr/bin/env bash
# Sourced helper: stop the green-roomz serve process recorded in $HOME/grz-serve.pid.
# Kills only if /proc/<pid>/cmdline still matches "bin/green-roomz.mjs serve".
GRZ_SERVE_PIDFILE="${GRZ_SERVE_PIDFILE:-$HOME/grz-serve.pid}"
grz_stop_serve() {
  local pid cmd
  [[ -f $GRZ_SERVE_PIDFILE ]] || return 0
  pid=$(head -c 32 "$GRZ_SERVE_PIDFILE" | tr -cd '0-9')
  if [[ -n $pid && -r /proc/$pid/cmdline ]]; then
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    case "$cmd" in
      *bin/green-roomz.mjs\ serve*)
        kill "$pid" 2>/dev/null || true
        for _ in 1 2 3 4 5; do [[ -d /proc/$pid ]] || break; sleep 1; done
        kill -9 "$pid" 2>/dev/null || true ;;
      *) echo "pidfile $pid is not green-roomz serve; not killing" >&2 ;;
    esac
  fi
  rm -f "$GRZ_SERVE_PIDFILE"
}
grz_write_pid() {
  ( umask 077; echo "$1" > "$GRZ_SERVE_PIDFILE" ); chmod 600 "$GRZ_SERVE_PIDFILE"
}
