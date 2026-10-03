# Fleet live console pack

Drop-in scripts so each host can show a **local** worker/stats console without cloning repos or scraping another machine.

Canonical layout skill (box): `/home/box/agent-data/workflows/watch-live-worker-console/SKILL.md`  
Deploy how-to: `/workspace/reviews/release/FLEET-LIVE-CONSOLE-DEPLOY-2026-09-12.md`

## What this is

| Host | Role | Script |
|------|------|--------|
| **box** (Linux assistant) | Full tmux + btop layout in xfce4-terminal | `start-watch-box.sh` |
| **qodesh / shalom** (Windows) | Left: log tail · Right: btop **or** Task Manager | `start-watch-windows.ps1` + `install-qodesh.ps1` |
| **note9** (Termux / later VM) | Lighter panes — see deploy doc § note9 | use Termux `tmux` 2-pane; not full btop stack |

**Hard rule:** Windows host CPU/RAM stay on Windows (`taskmgr` / local btop). Do **not** scrape laptop Task Manager into the Linux box console.

## Pack files

| File | Purpose |
|------|---------|
| `start-watch-box.sh` | Linux: rebuild tmux session `watch` (optional `--attach` → fullscreen xfce4-terminal) |
| `start-watch-windows.ps1` | Windows Terminal split: logs \| stats |
| `install-qodesh.ps1` | Create `C:\fleet\console\`, copy scripts, optional Desktop shortcut |
| `README.md` | This file |

## Quick start

### box

```bash
/workspace/session/fleet-console/start-watch-box.sh --attach
# or canonical:
/workspace/session/start-watch.sh
# then attach / open xfce4-terminal → tmux attach -t watch
```

Logs: `/workspace/session/console.log`, `prompt.log`, `response.log`  
Helpers: `live-io.sh`, `logline.sh` (session dir).

### qodesh / shalom

Copy this folder (USB, share, or agent drop) — **no git clone required**.

```powershell
# From the pack directory:
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-qodesh.ps1 -AlsoDocuments -Shortcut
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fleet\console\pack\Start-FleetConsole.ps1
```

Log roots (first existing wins):

- `C:\fleet\console\`
- `C:\Users\brian\Documents\green-roomz\data\_console\`

### note9 (Termux)

Keep it light — phone/Termux cannot comfortably run the full 6-pane btop layout:

```bash
# Example 2-pane (log | compact top)
tmux new-session -d -s watch -n console
tmux send-keys -t watch:0 'tail -F ~/grz-runtime/logs/console.log 2>/dev/null || tail -F ~/console.log' C-m
tmux split-window -t watch:0 -h 'top -d 2'
tmux attach -t watch
```

Later Note9 **VM** guest can adopt `start-watch-box.sh` when `tmux`+`btop` are present.

## Defensive notes

- No network installs from these scripts.
- No credentials, no repo clone, no peer scrape.
- Host metrics stay on that host.
- Missing `btop` on Windows → script tells you to open `taskmgr` (or `-OpenTaskMgr`).

## Sync

On box, prefer keeping `/workspace/session/start-watch.sh` as the daily driver; refresh `start-watch-box.sh` from it when the layout changes.
