# Green-Roomz Windows MVP (qodesh)

Operator: **Brian**. Host: Win11 Athlon II, 16 GB RAM, **8600 GT display only** — chat is **CPU llama** only. Never load GGUFs on the 8600 GT.

## What you get

OpenAI-compatible gateway on `http://127.0.0.1:8080`:

- Multi-turn `messages` (system / user / assistant)
- Streaming (`"stream": true`) and cancel via client abort / Ctrl-C
- Model list: `GET /v1/models`
- Clear aliases (see `config/agents.windows-mvp.json`)

No API-key product. No chat SPA — `GET http://127.0.0.1:8080/` is an operator page (health/models links). Do not use `https://localhost:8080` (there is no TLS; Firefox HTTPS-Only will fail). Prefer `127.0.0.1` over `localhost`. Chat is curl or any OpenAI-compatible client.

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

`start.cmd` defaults to `config\agents.windows-mvp.json` (override with `GRZ_MANIFEST`).

Health: `curl.exe -sS http://127.0.0.1:8080/health`

Help page (not a chat UI): open `docs\help\index.html` in a browser.

## Hard rules

- CPU llama only (`--device none --n-gpu-layers 0`).
- Do not stop the Linux cursor live serve (`:8080`/`:8187` on the box).
- Do not git push from operator scripts.
- Nexus stays 0.5B English JSON router — do not reuse Tekken as general chat.
