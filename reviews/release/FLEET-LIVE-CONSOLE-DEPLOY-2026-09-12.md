# Fleet live console deploy — 2026-09-12

**Goal:** Run the live worker/stats console on all boxen without cloning repos.  
**Pack:** `/workspace/session/fleet-console/`  
**Canonical skill (box layout):** `/home/box/agent-data/workflows/watch-live-worker-console/SKILL.md`  
**Skill draft (fleet):** `/workspace/reviews/release/skill-draft-fleet-live-console.md`

---

## Principles

1. **Host-local stats only** — qodesh/shalom CPU/RAM via Task Manager or local btop; never scrape Windows into the Linux console.
2. **No clone required** — copy the pack directory (USB, share, agent file drop).
3. **Defensive** — scripts create dirs and tails only; no network package installs, no credentials.
4. **Fit the glass** — full 6-pane layout on box; lighter panes on note9 Termux.

---

## Host matrix

| Host | OS | Start | Stats | Logs |
|------|----|-------|-------|------|
| **box** | Linux (assistant) | `start-watch-box.sh --attach` or `/workspace/session/start-watch.sh` | btop CPU / hist / mem (right ~80 cols) | `/workspace/session/{console,prompt,response}.log` |
| **qodesh** | Windows | `install-qodesh.ps1` then `Start-FleetConsole.ps1` | btop if present else **taskmgr** | `C:\fleet\console\` (primary) or `Documents\green-roomz\data\_console\` |
| **shalom** | Windows | Same as qodesh | Same | Same paths |
| **note9** | Termux (phone) / later VM | Termux 2-pane tmux (below); VM can use box script | `top` / later btop in VM | `~/grz-runtime/logs/` or `$HOME` / `/sdcard/Download/grz` |

---

## 1. box (Linux)

**Already present:** `tmux`, `btop`, `xfce4-terminal`, `/workspace/session/start-watch.sh`.

```bash
# Preferred pack entry (rebuilds session + optional fullscreen terminal)
/workspace/session/fleet-console/start-watch-box.sh --attach

# Canonical session script (tmux only; attach separately)
/workspace/session/start-watch.sh
tmux attach -t watch
# or: xfce4-terminal --fullscreen --hide-menubar --hide-scrollbar --hide-borders -e 'tmux attach -t watch'
```

**Layout (from skill):** left 50/50 worker log + prompt|response; right pinned ~80-col btop CPU (~45%) / per-core hist (~25%) / mem.  
**Do not** add laptop telemetry or a full-width backend strip.

**I/O helpers:** `/workspace/session/live-io.sh`, `/workspace/session/logline.sh`.

---

## 2. qodesh / shalom (Windows)

### Install (one-time)

Copy `/workspace/session/fleet-console/` to the host (any path), then:

```powershell
cd <path-to-fleet-console>
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-qodesh.ps1 -AlsoDocuments -Shortcut
```

Creates:

- `C:\fleet\console\` — log files (`console.log`, `prompt.log`, `response.log`)
- `C:\fleet\console\pack\` — scripts + `Start-FleetConsole.ps1`
- Optional: `Documents\green-roomz\data\_console\`
- Optional: Desktop shortcut **Fleet Live Console**

### Start

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fleet\console\pack\Start-FleetConsole.ps1
# force Task Manager open as well:
# ...\start-watch-windows.ps1 -OpenTaskMgr
```

**wt.exe** (Windows Terminal): horizontal split — left log tail, right btop or taskmgr guidance.  
If `wt.exe` missing: two PowerShell windows.

**Operators:** watch host load in Task Manager on that machine. The Linux box console must not display shalom/qodesh working-set.

---

## 3. note9 (Termux — light)

Phone Termux is not the full desktop layout. Use **two panes**:

```bash
mkdir -p "$HOME/grz-runtime/logs"
touch "$HOME/grz-runtime/logs/console.log"
tmux has-session -t watch 2>/dev/null && tmux kill-session -t watch
tmux new-session -d -s watch -n console -x 80 -y 24
tmux send-keys -t watch:0 "exec tail -F $HOME/grz-runtime/logs/console.log" C-m
tmux split-window -t watch:0 -h "exec top -d 2"
tmux attach -t watch
```

**Later Note9 VM:** when the guest has `tmux` + `btop`, copy `start-watch-box.sh` and set `SESSION` to the guest log dir:

```bash
SESSION="$HOME/session" ./start-watch-box.sh --attach
```

ListMachines does not register note9 today — bring-up via USB+adb from qodesh; do not assume remote start from box.

---

## 4. Distribution (no clone)

| Method | Notes |
|--------|-------|
| Agent file drop | Pack already on box under `/workspace/session/fleet-console/` |
| USB / share | Copy folder → Windows install script |
| Existing tree | If `Documents\green-roomz\data\_console\` exists, Windows script prefers it when `C:\fleet\console` absent |

Do **not** require `git clone` for console-only deploy.

---

## 5. Verification checklist

- [ ] box: `tmux ls` shows `watch`; panes titled log|prompt|response|cpu|hist|mem
- [ ] box: no Windows metrics in any pane
- [ ] qodesh: left pane tails `C:\fleet\console\console.log`
- [ ] qodesh: right pane btop **or** clear taskmgr prompt; `-OpenTaskMgr` works
- [ ] shalom: same as qodesh (host-local)
- [ ] note9 Termux: 2-pane attach works; no crash if btop absent
- [ ] Pack readable offline; install scripts create dirs without network

---

## 6. Related paths

| Path | Role |
|------|------|
| `/workspace/session/start-watch.sh` | Canonical box starter |
| `/workspace/session/fleet-console/` | Fleet pack |
| `/workspace/session/open-taskmgr.ps1` | Optional Windows taskmgr place helper (existing) |
| `/home/box/agent-data/workflows/watch-live-worker-console/SKILL.md` | Box watch skill |
| `/workspace/reviews/release/skill-draft-fleet-live-console.md` | Draft for `fleet-live-console` skill |

---

## Document control

| Field | Value |
|-------|-------|
| Created | 2026-09-12 |
| Method | Pack from canonical start-watch + Windows wt/taskmgr split + note9 light panes |
| Rules | Defensive · no clone · host-local stats · no laptop scrape into box |
