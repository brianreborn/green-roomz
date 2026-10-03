#!/bin/bash
# fleet-console: Linux box live worker/stats console (canonical layout).
# Source of truth on box: /workspace/session/start-watch.sh
# Pack copy: keep in sync when the session script changes.
# Usage:
#   ./start-watch-box.sh           # create/rebuild tmux session "watch"
#   ./start-watch-box.sh --attach  # also open fullscreen xfce4-terminal
# Env:
#   SESSION=/workspace/session     # log + btop config home (default)
#   FLEET_CONSOLE_ATTACH=1         # same as --attach
set -euo pipefail

ATTACH=0
for arg in "$@"; do
  case "$arg" in
    --attach|-a) ATTACH=1 ;;
    --help|-h)
      echo "Usage: $0 [--attach]"
      exit 0
      ;;
  esac
done
[ "${FLEET_CONSOLE_ATTACH:-0}" = "1" ] && ATTACH=1

SESSION="${SESSION:-/workspace/session}"
mkdir -p "$SESSION"
touch "$SESSION/console.log" "$SESSION/prompt.log" "$SESSION/response.log"

# Drop blank-only lines so one-liner log stays dense (defensive; no network).
python3 - << PY2
from pathlib import Path
p = Path("${SESSION}/console.log")
if p.exists():
    lines = [ln for ln in p.read_text().splitlines() if ln.strip() != ""]
    p.write_text(("\n".join(lines) + "\n") if lines else "")
PY2

apply_sizes() {
  local win_h win_w left_w right
  win_h=$(tmux display-message -t watch -p "#{window_height}")
  win_w=$(tmux display-message -t watch -p "#{window_width}")
  right=80
  if [ "$win_w" -lt 160 ]; then
    right=$((win_w * 40 / 100))
    [ "$right" -lt 60 ] && right=60
    [ "$right" -gt 64 ] && right=64
  fi
  tmux resize-pane -t watch:0.3 -x "$right"
  tmux resize-pane -t watch:0.0 -y $((win_h / 2))
  left_w=$(tmux display-message -t watch:0.0 -p "#{pane_width}")
  tmux resize-pane -t watch:0.1 -x $((left_w / 2))
  tmux resize-pane -t watch:0.3 -y $((win_h * 45 / 100))
  tmux resize-pane -t watch:0.4 -y $((win_h * 25 / 100))
}

# Prereqs (fail soft with message — no install from network here)
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need tmux
need btop

CPU_METER="${SESSION}/cpu-meter.sh"
if [ ! -x "$CPU_METER" ]; then
  # Pack may be alone; fall back to a tiny meter if session helper absent
  CPU_METER=""
fi

tmux has-session -t watch 2>/dev/null && tmux kill-session -t watch
# Size for a 1280x800 fullscreen terminal so splits have room before attach.
tmux new-session -d -s watch -n console -x 180 -y 54
tmux send-keys -t watch:0 "exec tail -F ${SESSION}/console.log" C-m

tmux split-window -t watch:0 -h -l 80
tmux send-keys -t watch:0.1 "export XDG_CONFIG_HOME=${SESSION}/btop-cpu TERM=xterm-256color; exec btop" C-m
tmux split-window -t watch:0.1 -v -p 30
tmux send-keys -t watch:0.2 "export XDG_CONFIG_HOME=${SESSION}/btop-mem TERM=xterm-256color; exec btop" C-m
tmux split-window -t watch:0.1 -v -p 36
if [ -n "$CPU_METER" ]; then
  tmux send-keys -t watch:0.2 "exec ${CPU_METER}" C-m
else
  tmux send-keys -t watch:0.2 "exec watch -n1 'grep -E \"cpu |Mem:\" /proc/stat /proc/meminfo 2>/dev/null | head -20'" C-m
fi

tmux split-window -t watch:0.0 -v -p 50 -c "$SESSION" "exec tail -F ${SESSION}/prompt.log"
tmux split-window -t watch:0.1 -h -c "$SESSION" "exec tail -F ${SESSION}/response.log"

apply_sizes

tmux select-pane -t watch:0.0 -T log
tmux select-pane -t watch:0.1 -T prompt
tmux select-pane -t watch:0.2 -T response
tmux select-pane -t watch:0.3 -T cpu
tmux select-pane -t watch:0.4 -T hist
tmux select-pane -t watch:0.5 -T mem
tmux set-option -t watch pane-border-status top
tmux set-option -t watch pane-border-format " #{pane_title} "
tmux set-option -t watch status-style "bg=black,fg=green"
tmux set-option -t watch status-left " live "
tmux set-option -t watch status-right " log | prompt | response | cpu | hist | mem "
tmux select-pane -t watch:0.0

echo "tmux session 'watch' ready (SESSION=${SESSION})"

if [ "$ATTACH" = "1" ]; then
  if command -v xfce4-terminal >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
    xfce4-terminal \
      --fullscreen \
      --hide-menubar \
      --hide-scrollbar \
      --hide-borders \
      -e "tmux attach -t watch" &
    echo "opened xfce4-terminal fullscreen → tmux attach -t watch"
  else
    echo "attach manually: tmux attach -t watch"
    echo "(xfce4-terminal/DISPLAY not available — use existing terminal)"
  fi
fi
