# Windows smoke checklist (beta-0.2, qodesh / shalom)

No admin. Per-user install. CPU llama only. Do not stop the Linux cursor serve.

## 1. Install

- [ ] Log in as `brian` (no elevation).
- [ ] Extract the pack (or run `install-windows.cmd` from the extracted `green-roomz\` folder).
- [ ] Double-click / run `install-windows.cmd`. No UAC prompt.
- [ ] Confirm `%LOCALAPPDATA%\Green-Roomz\start.cmd` exists.
- [ ] Confirm Start Menu shortcut: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Green-Roomz\Green-Roomz.lnk` (or `.url` fallback).
- [ ] Confirm `%LOCALAPPDATA%\Green-Roomz\data\install.log` has a timestamped copy/llama/shortcut line.
- [ ] Confirm `runtime\llama-server.exe` is present (fetched from official CPU zip `llama-b10702-bin-win-cpu-x64.zip` if it was missing). Not vulkan. Not cuda.
- [ ] If Node was missing: installer printed https://nodejs.org/en/download and https://nodejs.org/dist/latest-v22.x/ then exited 1. Install the x64 LTS MSI yourself, new terminal, re-run install or `start.cmd`.
- [ ] Re-run `install-windows.cmd` once: files refresh, still a single shortcut, `data\` kept.

## 2. Start

- [ ] Start Menu → Green-Roomz, **or** `%LOCALAPPDATA%\Green-Roomz\start.cmd`.
- [ ] A cmd window stays open (operator console). Title/cwd is the LocalAppData pack, not Program Files.
- [ ] Console also tees to `%LOCALAPPDATA%\Green-Roomz\data\serve.log`.

## 3. Health

From a **second** cmd window:

```bat
curl.exe -sS http://127.0.0.1:8080/health
```

- [ ] HTTP 200. JSON has `"product": "Green-Roomz"` and `"status": "ok"` or `"degraded"` (degraded is normal if specialists are cold).
- [ ] Optional: `curl.exe -sS http://127.0.0.1:8080/v1/models`
- [ ] qodesh: llama stays CPU (`--device none --n-gpu-layers 0`). Do not load GGUFs on the 8600 GT.

## 4. Stop

```bat
"%LOCALAPPDATA%\Green-Roomz\stop.cmd"
```

- [ ] Prints `stopped`.
- [ ] `curl.exe -sS -m 2 http://127.0.0.1:8080/health` fails (connection refused).
- [ ] Serve console has exited. Ctrl-C in that window is also valid.

## 5. Uninstall leftover check

```bat
"%LOCALAPPDATA%\Green-Roomz\uninstall-windows.cmd"
dir "%LOCALAPPDATA%\Green-Roomz"
dir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Green-Roomz"
dir "%ProgramFiles%\Green-Roomz"
dir "%ProgramFiles(x86)%\Green-Roomz"
```

- [ ] LocalAppData `Green-Roomz` is gone (dir says not found).
- [ ] Start Menu `Green-Roomz` folder is gone (no leftover `.lnk` / `.url`).
- [ ] No `Program Files\Green-Roomz` (this installer never created one).
- [ ] Optional read-only: `reg query HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall /s /f Green-Roomz` — expect no key. Do not write HKLM.
