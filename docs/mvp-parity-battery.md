# MVP parity battery (Windows / qodesh)

Capability-surface check that Green-Roomz localhost gateway behaves like a **basic** ChatGPT/Grok client target — multi-turn, stream, model pick, abort, health, instruct follow. **Not** a quality / SOTA bench.

| | |
|---|---|
| Scripts | `scripts/mvp-parity-battery.cmd` → `scripts/mvp-parity-battery.ps1` |
| Target | `http://127.0.0.1:8080` (`GRZ_BASE_URL` override) |
| Default model | `general-text-speculator` (`GRZ_MODEL` or argv) |
| Results | `data/mvp-parity-last.json` (gitignored under `data/*.json`) |
| Host | qodesh Win11 Athlon II — short prompts, `max_tokens` 48–128 |
| Rules | CPU llama only; never GGUF on 8600 GT; do not stop Linux cursor `:8080`/`:8187` |

Run (serve already up with `config/agents.windows-mvp.json`):

```bat
scripts\mvp-parity-battery.cmd
```

Fail closed: any HTTP error or case FAIL → exit 1.

---

## Case map

| ID | What it hits | Maps to (ChatGPT/Grok-like surface) | Pass rule |
|----|--------------|--------------------------------------|-----------|
| **A** | `GET /health` | Service up / product identity | HTTP 2xx; JSON `product=Green-Roomz` and a `status` field (`ok` or `degraded` OK) |
| **B** | `GET /v1/models` | Model picker / alias list | `data[]` includes MVP aliases `general-text-speculator` and `tool-router-agent` |
| **C** | `POST /v1/chat/completions` `stream:false` model=`general-text-speculator` | One-shot chat completion | HTTP 2xx; non-empty `choices[0].message.content` |
| **D** | Multi-turn `messages` (user → assistant → user: “what did I call myself”) | Conversation memory / multi-turn | HTTP 2xx; non-empty reply (soft note if literal name missing — tiny Instruct may paraphrase) |
| **E** | `stream:true` via `curl.exe -N` | Token streaming (SSE) | Body contains one or more `data:` lines |
| **F** | Start stream, kill `curl.exe` early (~800 ms) | Abort / stop generating (Ctrl-C) | **PASS if client connection closes cleanly** (process exits after Kill). Does not require a server cancel ACK. |
| **G** | `POST` with `system` + `user` roles | System prompt / instruct follow | HTTP 2xx; non-empty reply (optional case; still counted) |

Prompts stay Athlon-friendly (roughly 64–128 tokens max per request). Quality of wording is out of scope.

---

## Results stub shape

`data/mvp-parity-last.json`:

```json
{
  "schema": "green-roomz.mvp-parity-battery.v1",
  "product": "Green-Roomz",
  "base_url": "http://127.0.0.1:8080",
  "model": "general-text-speculator",
  "overall": "PASS|FAIL",
  "summary": { "pass": 7, "fail": 0, "skip": 0, "total": 7 },
  "cases": [
    { "id": "A", "name": "...", "status": "PASS", "detail": "...", "ms": 12 }
  ]
}
```

Operator review template (filled on qodesh): `/workspace/reviews/qodesh-mvp-parity-battery.md`.

---

## Related

- `WINDOWS-MVP.md` — pack overview
- `docs/windows-mvp-aliases.md` — alias table
- `scripts/chat-mvp.cmd` — interactive multi-turn console
- `SMOKE-WINDOWS.md` §6 — manual smoke checklist
