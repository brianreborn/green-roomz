#!/usr/bin/env bash
# Sourced helper: stop the green-roomz serve process recorded in $HOME/grz-serve.pid.
# Kills only if /proc/<pid>/cmdline still matches "bin/green-roomz.mjs serve".
# Platform/Race: re-check cmdline before EVERY kill and kill -9 — never signal a bare pid
# that may have been reused by an unrelated process after the first look.
GRZ_SERVE_PIDFILE="${GRZ_SERVE_PIDFILE:-$HOME/grz-serve.pid}"

# True when /proc/$1/cmdline still looks like our serve. No match → do not signal.
grz_pid_is_serve() {
  local pid=$1 cmd
  [[ -n $pid && -r /proc/$pid/cmdline ]] || return 1
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *bin/green-roomz.mjs\ serve*) return 0 ;;
    *) return 1 ;;
  esac
}

grz_stop_serve() {
  local pid
  [[ -f $GRZ_SERVE_PIDFILE ]] || return 0
  pid=$(head -c 32 "$GRZ_SERVE_PIDFILE" | tr -cd '0-9')
  if [[ -n $pid ]]; then
    if grz_pid_is_serve "$pid"; then
      kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5; do [[ -d /proc/$pid ]] || break; sleep 1; done
      # Re-check before SIGKILL (pid may have been reused during the wait).
      if grz_pid_is_serve "$pid"; then
        kill -9 "$pid" 2>/dev/null || true
      elif [[ -d /proc/$pid ]]; then
        echo "pidfile $pid no longer green-roomz serve after wait; not sending SIGKILL" >&2
      fi
    else
      echo "pidfile $pid is not green-roomz serve; not killing" >&2
    fi
  fi
  rm -f "$GRZ_SERVE_PIDFILE"
}
grz_write_pid() {
  ( umask 077; echo "$1" > "$GRZ_SERVE_PIDFILE" ); chmod 600 "$GRZ_SERVE_PIDFILE"
}
