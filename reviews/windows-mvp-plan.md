# Windows MVP plan — Green-Roomz on qodesh

Date: 2026-09-06 ~08:05 PT. Operator: **Brian**. Target: **qodesh** (Win11, Athlon II, 16 GB RAM, 8600 GT 224 MB display-only / CUDA sm_1.1 — **never load GGUFs there**). Chat stays **CPU llama** (`--device none --n-gpu-layers 0`). Tree: `/workspace/green-roomz`. Live box serve on `:8080`/`:8187` left alone. No git push.

Goal: feature set that matches **basic** Grok/ChatGPT — multi-turn chat, clear model pick, streaming tokens, stop, simple system/user turns — on minimal hardware.

---

## 1. MVP chat surface — gateway has vs missing

### Already present (gateway / OpenAI-compatible)

| Capability | Where | Notes |
|---|---|---|
| Multi-turn chat | `POST /v1/chat/completions` | `messages[]` with `system` / `user` / `assistant` roles; gateway injects agent system policy once |
| Streaming tokens | `stream: true` | SSE via `proxy.writeSanitizedSse`; client disconnect aborts (`AbortController` on request close) |
| Stop / cancel | Client close / abort | No product “Stop” button; curl Ctrl-C or fetch abort ends the upstream |
| Model list | `GET /v1/models` | Lists manifest aliases (11 on cursor pack) |
| Health | `GET /health`, `/v1/health` | Product + degraded/ok |
| Explicit model pick | `model` / alias field | Route to specialist alias; nexus routes when using tool-router |
| Route-only | `POST /v1/chat/completions/route` | Plan without full completion |
| Slash council | `/council …` in user text | Parsed in gateway (advanced; not basic chat) |
| Session TTL | gateway config | Server-side session map; client still owns transcript history in `messages` |

### Gaps vs basic ChatGPT / Grok UX

| Gap | Severity for MVP | Mitigation this cut |
|---|---|---|
| **No first-party web chat UI** | High (feel) | Document OpenAI-compatible curl; `docs/help/index.html` is operator help only, not a chat SPA. Do **not** invent an API-key product. |
| **No in-app model picker** | Medium | Operator picks alias via `"model": "general-text-speculator"` (or nexus). `/v1/models` is the list. |
| **No Stop button UI** | Low (API has abort) | Document Ctrl-C / abort; streaming already tears down on client close. |
| **general-text / code GGUFs missing on qodesh pack** | High (quality) | Fetch tiny Instruct Q4 into `models/`; MVP manifest points general-text there. Code stays cold. |
| **Nexus 0.5B is English JSON router, not a chat buddy** | Medium (PF8) | Keep nexus as router only; chat replies come from general-text Instruct. |
| **No conversation sidebar / regenerate / edit** | Out of scope | Client (curl, Open WebUI, SillyTavern, etc.) can sit on the same API later. |
| **beta-0.2 installer has no one-click model fetch** | Medium | Add `scripts/fetch-tiny-instruct.cmd`; plan beta-0.4 to call it optionally. |

**Bottom line:** The gateway already covers the **API** half of basic ChatGPT (messages, stream, abort, models). The Windows MVP gap is **operator path** (which GGUF, how to curl, clear aliases) — not a new SPA.

---

## 2. Model matrix for old hardware (16 GB, CPU only)

Leave OS + browser + gateway + KV headroom. Prefer **≤~1–2B Q4**. **Never** map onto 8600 GT VRAM.

| Role | Candidate | Size (Q4_K_M) | Lang | Status | Download |
|---|---|---|---|---|---|
| **Nexus (JSON router)** | Qwenstral-Small-3.1-0.5B Q4_K_M | ~439 MB on disk (existing pack) | **English-only** JSON route (PF8) | **Keep** — already in `models/` | Pack-local; do not replace with Instruct |
| **general-text (chat)** | **Qwen2.5-0.5B-Instruct Q4_K_M** (default) | **~398 MB** (`x-linked-size: 397808192`) | Multilingual Instruct (EN primary OK) | **MVP default** — CPU only | [bartowski resolve URL](https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf) |
| general-text alt | Official Qwen/Qwen2.5-0.5B-Instruct-GGUF `qwen2.5-0.5b-instruct-q4_k_m.gguf` | ~491 MB | Multilingual | Verified HEAD 302→octet-stream | [official resolve](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf) |
| **Optional sprint** | Qwen2.5-1.5B-Instruct Q4_K_M | **~986 MB** | Multilingual | When RAM free (nexus + 1.5B + OS still OK on 16 GB) | [bartowski 1.5B](https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf) |
| code | coder 1.5B–7B Q4 | ≥~1 GB | EN code | **Cold** until RAM/UX allows second warm specialist | later |
| vision / SD / whisper | various | large | — | Out of MVP on qodesh | missing-* placeholders |

**RAM sketch (qodesh):** 16 GB total → ~4–6 GB OS+Firefox+Node → nexus 0.5B mmap + KV (~1–2 GB warm) → Instruct 0.5B second specialist (~1–2 GB) leaves headroom. 1.5B Q4 optional when only one specialist warm. **4B+ stays off** this host for MVP.

**Verified 2026-09-06 (curl -sI):** bartowski 0.5B Instruct Q4_K_M → HTTP 200, `content-length: 397808192`. Official Qwen 0.5B Q4_K_M and bartowski 1.5B Q4_K_M also resolve.

---

## 3. Installer path — beta-0.4 LocalAppData + CPU llama b10702

Current: **beta-0.2** `install-windows.cmd` → `%LOCALAPPDATA%\Green-Roomz`, Start Menu `.lnk`, fetches **CPU** `llama-b10702-bin-win-cpu-x64.zip` only, no Node download, no vulkan/cuda.

**Keep for beta-0.4:**

- Same LocalAppData + Start Menu + uninstall footprint.
- Same CPU llama b10702 fetch (fail closed).
- Manifest default for qodesh MVP: `config/agents.windows-mvp.json` (or flag), still `${GRZ_ROOT}` / CPU profiles.
- **Never** copy LocalAI vulkan paths; **never** load GGUFs on 8600 GT.

**Add for one-click tiny instruct:**

1. Ship `scripts/fetch-tiny-instruct.cmd` (this cut) — downloads **one** chosen GGUF into `models\`, fail closed on curl error, default bartowski 0.5B Instruct Q4_K_M.
2. beta-0.4 installer: after llama fetch, if `models\Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` missing, optionally call that script (or print “run scripts\fetch-tiny-instruct.cmd”).
3. `start.cmd` prints gateway URL + curl chat example (this cut).
4. Document: no API keys; OpenAI-compatible localhost only.

---

## 4. This-cut deliverables

- `/workspace/reviews/windows-mvp-plan.md` (this file)
- Pack-root `WINDOWS-MVP.md`
- `config/agents.windows-mvp.json`
- `scripts/fetch-tiny-instruct.cmd`
- Light updates: `start.cmd`, `INSTALL-WINDOWS.md`, `docs/windows-mvp-aliases.md`
- P0/PF untouched; live `:8080`/`:8187` untouched; no git push; no GGUF on 8600 GT
