# Green-Roomz Windows MVP (qodesh)

Operator: **Brian**. Host: Win11 Athlon II, 16 GB RAM, **8600 GT display only** — chat is **CPU llama** only. Never load GGUFs on the 8600 GT.

## What you get

OpenAI-compatible gateway on `http://127.0.0.1:8080`:

- Multi-turn `messages` (system / user / assistant)
- Streaming (`"stream": true`) and cancel via client abort / Ctrl-C
- Model list: `GET /v1/models`
- Clear aliases (see `config/agents.windows-mvp.json`)

No API-key product. `GET http://127.0.0.1:8080/` is an operator page (not the chat UI). Do not use `https://localhost:8080` (there is no TLS; Firefox HTTPS-Only will fail). Prefer `127.0.0.1` over `localhost`.

Clients (use any mix; they share the same gateway):

| Client | How | What |
|---|---|---|
| **Unicorn** | `scripts\unicorn.cmd` or [http://127.0.0.1:8080/unicorn](http://127.0.0.1:8080/unicorn) | Browser chat + file drop |
| **chat-mvp** | `scripts\chat-mvp.cmd` | Multi-turn console (stream / Ctrl-C) |
| **llama.app** | OpenAI-compat GUI at `http://127.0.0.1:8080` | Desktop JSON/REST client |
| curl / SDK | `POST /v1/chat/completions` | Anything OpenAI-shaped |

## One-time on qodesh

1. Run `install-windows.cmd` → `%LOCALAPPDATA%\Green-Roomz` (CPU llama b10702).
2. Fetch the tiny Instruct GGUF (CPU mmap):

```bat
"%LOCALAPPDATA%\Green-Roomz\scripts\fetch-tiny-instruct.cmd"
```

Default: `bartowski/Qwen2.5-0.5B-Instruct-GGUF` → `models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` (~0.40 GB).

3. Start with the MVP manifest (edit `start.cmd` or pass explicitly):

```bat
node bin\green-roomz.mjs serve --manifest config\agents.windows-mvp.json --host 127.0.0.1 --port 8080
```

The Windows launcher runs `scripts\prepare-windows-media.ps1` first. It reuses
the local Qwen2.5-VL model/projector when present and reports missing image
generation artifacts before the server starts. To download a missing artifact,
provide its URL and use the matching switch, for example:

```powershell
$env:GRZ_VISION_MODEL_URL = 'https://...'
$env:GRZ_VISION_PROJECTOR_URL = 'https://...'
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-windows-media.ps1 -DownloadVision
```

The current host already has the vision model and projector under `C:\LocalAI`.
Image generation still needs `stable-diffusion.cpp\bin\sd-server.exe`; its
model is present, but the runtime binary is not.

To install dependencies automatically:

```powershell
# The wrapper opens UAC automatically when Windows requires elevation.
npm run media:install:admin -- -InstallWsl

# After WSL finishes installing (and after reboot if requested):
npm run media:install:admin -- -InstallFestival

# Optional: use a trusted stable-diffusion.cpp Windows zip URL.
$env:GRZ_IMAGE_RUNTIME_URL = 'https://.../stable-diffusion-windows.zip'
npm run media:install -- -DownloadImageRuntime
```

The installer is idempotent and verifies `festival` and `sd-server.exe` after
installation. It never invents a runtime download URL or silently installs an
incompatible GPU build.

## Aliases (MVP)

| Alias | GGUF | Role |
|---|---|---|
| `tool-router-agent` (nexus) | existing `Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | English JSON **router only** (PF8) |
| `general-text-speculator` | `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | Chat / writing — **CPU** |
| `qwenstral-code-speculator` | cold / missing | Until RAM allows |

Optional later: Qwen2.5-**1.5B**-Instruct Q4_K_M (~1 GB) when free RAM allows.

## Chat (curl)

```bat
curl.exe -sS http://127.0.0.1:8080/v1/models
```

Windows cmd one-liner:

```bat
curl.exe -sS http://127.0.0.1:8080/v1/chat/completions -H "Content-Type: application/json" -d "{\"model\":\"general-text-speculator\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"Say hello in one short sentence.\"}]}"
```

Stream: set `"stream":true` and watch SSE; Ctrl-C stops.

Multi-turn console (model pick / stream / Ctrl-C stop):

```bat
scripts\chat-mvp.cmd
```

Web / file-drop (same gateway, can run at the same time):

```bat
scripts\unicorn.cmd
```

That opens `http://127.0.0.1:8080/unicorn`. Drop stays enabled during generate. Vision/audio/image-gen aliases are still unavailable on this MVP, so those drops get an honest 400/503.

`start.cmd` defaults to `config\agents.windows-mvp.json` (override with `GRZ_MANIFEST`).

Health: `curl.exe -sS http://127.0.0.1:8080/health`

**UAT (live, required if you claim serve works):** `node scripts\uat.mjs`  
**Automated e2e (own llama):** `set GRZ_E2E=1` then `npm run test:e2e`  
See [docs/UAT.md](docs/UAT.md). Domain `npm test` is not a ship bar.

Operator page: `http://127.0.0.1:8080/` (HTTP). Not a chat UI.

## Hard rules

- CPU llama only (`--device none --n-gpu-layers 0`).
- Do not stop the Linux cursor live serve (`:8080`/`:8187` on the box).
- Do not git push from operator scripts.
- Nexus stays 0.5B English JSON router — do not reuse Tekken as general chat.
