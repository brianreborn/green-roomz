#!/usr/bin/env bash
S=builddash
tmux kill-session -t $S 2>/dev/null
tmux new-session -d -s $S -x 200 -y 55 "btop"
tmux split-window -h -b -t $S -p 45 "tail -n 200 -F /workspace/session/build-live.log"
tmux split-window -v -t $S:0.0 -p 35 "watch -t -n 2 /workspace/session/build-status.sh"
tmux set -t $S status off
tmux set -t $S pane-border-status top
tmux select-pane -t $S:0.0 -T 'Build log'
tmux select-pane -t $S:0.1 -T 'Build status'
tmux select-pane -t $S:0.2 -T 'System resources'
