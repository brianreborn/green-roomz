# Skill draft — fleet-live-console

Ready for `update_state` / skill install. Body is self-contained; pack paths are on-box.

---

## name

```
fleet-live-console
```

## description

```
use when deploying or starting the live worker/stats console on any fleet host (box, qodesh, shalom, note9): host-local layout only, no laptop scrape into Linux, no repo clone required; pack at /workspace/session/fleet-console/
```

## body

```markdown
# Fleet live console

Start or deploy the live worker/stats console on **each host** using the pack at `/workspace/session/fleet-console/`. Prefer this skill for multi-host / Windows / note9; use **Watch live worker console** for box-only fullscreen monitoring.

## Rules

- **Host-local stats only.** Windows CPU/RAM → Task Manager or local btop on qodesh/shalom. Never scrape laptop metrics into the Linux box console.
- **No repo clone** for console-only deploy — copy the pack folder.
- **Defensive** — create dirs, tail logs, open local tools; no network installs, no credentials.
- Keep chat quiet about the monitor itself; do not burn tokens on screenshots of the console.

## Pack

| File | Host |
|------|------|
| `start-watch-box.sh` | Linux box (`--attach` → xfce4-terminal fullscreen) |
| `start-watch-windows.ps1` | qodesh / shalom (wt.exe split: logs \| btop/taskmgr) |
| `install-qodesh.ps1` | Windows one-time dirs + copy + optional shortcut |
| `README.md` | Operator summary |

Deploy how-to: `/workspace/reviews/release/FLEET-LIVE-CONSOLE-DEPLOY-2026-09-12.md`  
Box layout detail: `/home/box/agent-data/workflows/watch-live-worker-console/SKILL.md`  
Canonical box script: `/workspace/session/start-watch.sh`

## Per host

### box

```bash
/workspace/session/fleet-console/start-watch-box.sh --attach
```

Layout: left 50/50 `console.log` + `prompt.log`|`response.log`; right ~80-col btop CPU / hist / mem. Session logs under `/workspace/session/`. Write I/O with `live-io.sh` / `logline.sh`.

### qodesh / shalom

```powershell
# once
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-qodesh.ps1 -AlsoDocuments -Shortcut
# start
powershell -NoProfile -ExecutionPolicy Bypass -File C:\fleet\console\pack\Start-FleetConsole.ps1
```

Log roots: `C:\fleet\console\` or `C:\Users\brian\Documents\green-roomz\data\_console\`. If btop missing, open **taskmgr** on that host (`-OpenTaskMgr`).

### note9

Termux: **light** 2-pane (`tail -F` log | `top`). Do not force full 6-pane btop on phone. Later Note9 VM: run `start-watch-box.sh` with `SESSION` set to the guest log dir when tmux+btop exist. note9 is not on ListMachines — USB+adb from qodesh for bring-up.

## Do not

- Add Windows working-set / Task Manager scrape into the box tmux layout
- Add a full-width backend strip that breaks the 50/50 left column
- Require git clone or public package download to start the console
- Block the actual task on console layout work
```

---

## Install note (for update_state later)

Suggested skill path pattern (match existing workflows):

`/home/box/agent-data/workflows/fleet-live-console/SKILL.md`

Front matter:

```yaml
---
name: Fleet live console
description: >-
  use when deploying or starting the live worker/stats console on any fleet host (box, qodesh, shalom, note9): host-local layout only, no laptop scrape into Linux, no repo clone required; pack at /workspace/session/fleet-console/
---
```

Then paste the **body** markdown (without the outer fence) as the skill content.
