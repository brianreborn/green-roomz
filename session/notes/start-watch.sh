#!/bin/bash
set -euo pipefail
SESSION=/workspace/session
mkdir -p "$SESSION"
touch "$SESSION/console.log" "$SESSION/prompt.log" "$SESSION/response.log"
python3 - << 'PY2'
from pathlib import Path
p = Path("/workspace/session/console.log")
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

tmux has-session -t watch 2>/dev/null && tmux kill-session -t watch
# Size for a 1280x800 fullscreen terminal so splits have room before attach.
tmux new-session -d -s watch -n console -x 180 -y 54
tmux send-keys -t watch:0 "exec tail -F /workspace/session/console.log" C-m

tmux split-window -t watch:0 -h -l 80
tmux send-keys -t watch:0.1 "export XDG_CONFIG_HOME=/workspace/session/btop-cpu TERM=xterm-256color; exec btop" C-m
tmux split-window -t watch:0.1 -v -p 30
tmux send-keys -t watch:0.2 "export XDG_CONFIG_HOME=/workspace/session/btop-mem TERM=xterm-256color; exec btop" C-m
tmux split-window -t watch:0.1 -v -p 36
tmux send-keys -t watch:0.2 "exec /workspace/session/cpu-meter.sh" C-m

tmux split-window -t watch:0.0 -v -p 50 -c "$SESSION" "exec tail -F /workspace/session/prompt.log"
tmux split-window -t watch:0.1 -h -c "$SESSION" "exec tail -F /workspace/session/response.log"

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
