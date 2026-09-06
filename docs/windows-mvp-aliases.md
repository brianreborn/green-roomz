# Windows MVP aliases (qodesh)

Companion to `config/agents.windows-mvp.json` and pack-root `WINDOWS-MVP.md`.
Does **not** replace `agents.cursor.json` (Linux box) or `agents.windows.json` (shalom overlay).

## Recommended aliases

| Alias | Path | Notes |
|---|---|---|
| `tool-router-agent` / nexus | `models/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf` | **PF8** English JSON router only. Not general chat. |
| `general-text-speculator` | `models/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | Default chat. Fetch via `scripts/fetch-tiny-instruct.cmd`. CPU only. |
| `qwenstral-code-speculator` | `models/missing-qwen-instruct.gguf` | Cold until RAM allows a second instruct/coder. |

## Optional sprint

When free RAM allows (still CPU, never 8600 GT):

- `bartowski/Qwen2.5-1.5B-Instruct-GGUF` → `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (~986 MB)
  - Override: `set GRZ_TINY_URL=https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`
  - `set GRZ_TINY_FILE=Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`
  - Then point `general-text-speculator.model` at that file.

## agents.cursor.json relation

Cursor pack keeps nexus on Qwenstral 0.5B and code/general-text on `missing-qwen-instruct.gguf` until an instruct is present.
Windows MVP is the first place general-text is wired to a real tiny Instruct path after fetch.

## Console helper

`scripts/chat-mvp.cmd` — multi-turn, `/model`, stream, Ctrl-C stop. Defaults to `general-text-speculator`.
