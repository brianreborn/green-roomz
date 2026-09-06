# Green-Roomz Windows install (beta-0.4, no admin)

Operator: **Brian**. Hosts: **qodesh** (Win11, Firefox, `C:\Users\brian`, Athlon II + 8600 GT) and **shalom** (Win).

The `.cmd` **is** the installer for v1. No `.exe`, no `.msi`, no signtool, no UAC, no self-signed cert, no `icacls`.

## What it does

- Copies this portable pack to `%LOCALAPPDATA%\Green-Roomz` (per-user; not Program Files).
- Writes a Start Menu shortcut under `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Green-Roomz`. Primary is a `.lnk` via `cscript` / WScript.Shell (no elevation, working directory set). Same path every run — re-run does not duplicate. If `cscript` fails, a `.url` is written instead (Firefox on qodesh may open that in the browser; prefer the `.lnk`).
- If `runtime\llama-server.exe` is missing, fetches the official **CPU** zip to `%TEMP%` and expands into `runtime\`:
  `https://github.com/ggml-org/llama.cpp/releases/download/b10702/llama-b10702-bin-win-cpu-x64.zip`
  Never vulkan. Never CUDA. This installer does **not** copy `C:\LocalAI\llama-b10665-bin-win-vulkan-x64`.
- If Node is missing, prints the official LTS MSI URL and exits 1. It does **not** download Node (that MSI is an admin install you run yourself).
- Writes `uninstall-windows.cmd` next to the install (LocalAppData + Start Menu only; no HKLM).
- Logs to `%LOCALAPPDATA%\Green-Roomz\data\install.log`.
- Idempotent: second run refreshes pack files, keeps `data\`, rewrites the same shortcut, skips llama fetch if the exe is already there.

## Node prerequisite

Install yourself, then open a **new** cmd window so PATH updates:

- https://nodejs.org/en/download
- https://nodejs.org/dist/latest-v22.x/

Pick the Windows x64 **LTS MSI**. `package.json` engines says `>=22`. Node 20 has been used successfully on this pack.

## CPU llama only (qodesh 8600 GT)

- Pack llama is **CPU**. Official zip name: `llama-b10702-bin-win-cpu-x64.zip`.
- **Never load GGUFs on the 8600 GT** (224 MB, sm_1.1). Display only. The 0.5B Q4 is CPU mmap. Manifest stays `--device none --n-gpu-layers 0`.
- Do not install CUDA 6.5. Do not fetch vulkan/cuda llama zips.

## Start / stop / console log

| Action | Where |
|---|---|
| Start | Start Menu → Green-Roomz, or `%LOCALAPPDATA%\Green-Roomz\start.cmd` |
| Gateway | http://127.0.0.1:8080 |
| Stop | `%LOCALAPPDATA%\Green-Roomz\stop.cmd` or Ctrl-C in the serve console |
| Live console | the `start.cmd` window (operator TTY) |
| File log | `%LOCALAPPDATA%\Green-Roomz\data\serve.log` (`attachServeConsole` tees TTY + file) |
| Install log | `%LOCALAPPDATA%\Green-Roomz\data\install.log` |

`stop.cmd` is Windows loopback (`127.0.0.1:8080` / `:8187`) only. It must not be used against the Linux cursor serve.

## operator-usage.json

Drop occupancy / `/usage` (tokens, context fill, slot use) here — the installer never overwrites `data\` on refresh:

`%LOCALAPPDATA%\Green-Roomz\data\operator-usage.json`

**70% fill is L0+L1+L2+L3 combined**, not L0 alone. If this file is absent, occupancy is unknown — do not invent it.

Example:

```json
{
  "tokens": 0,
  "context_fill": 0.0,
  "slot_use": 0,
  "fill_budget": "L0+L1+L2+L3",
  "fill_target": 0.70
}
```

## Uninstall

`%LOCALAPPDATA%\Green-Roomz\uninstall-windows.cmd`

Removes `%LOCALAPPDATA%\Green-Roomz` and the Start Menu `Green-Roomz` folder only. Leaves Program Files, HKLM, Documents checkout, and `C:\LocalAI` alone.

## Windows MVP chat (beta-0.4 path)

Goal on **qodesh**: basic ChatGPT-style API (multi-turn, stream, stop via abort, model alias) on CPU llama — not a SPA, not an API-key product.

1. After install, fetch the tiny Instruct GGUF (CPU only, ~0.40 GB):

```bat
"%LOCALAPPDATA%\Green-Roomz\scripts\fetch-tiny-instruct.cmd"
```

Default URL (verified):  
`https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`  
→ `models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`

2. Prefer MVP manifest on qodesh:

```bat
cd /d "%LOCALAPPDATA%\Green-Roomz"
node bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json --host 127.0.0.1 --port 8080
```

- Nexus (`tool-router-agent`): existing Qwenstral 0.5B English JSON router (PF8).
- Chat (`general-text-speculator`): Instruct Q4_K_M above, CPU only.
- Code: cold until RAM allows.

3. Chat example:

```bat
curl.exe -sS http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"general-text-speculator\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello\"}]}"
```

`start.cmd` defaults to `config\agents.windows-mvp.json` and prints these hints.
Multi-turn console: `scripts\chat-mvp.cmd` (stream + Ctrl-C stop).
See pack-root `WINDOWS-MVP.md` and `docs/windows-mvp-aliases.md`.

