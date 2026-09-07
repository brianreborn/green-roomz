# Beta tonight (qodesh Windows MVP, 2026-09-07 ~10:10 UTC)

Operator board. Host: qodesh (Win11 Athlon II, CPU llama only). Manifest: `config/agents.windows-mvp.json`. No git push, no model download, no CUDA.

## Listening

**Yes.** `GET http://127.0.0.1:8080/health` returns JSON.

| | |
|---|---|
| Gateway | `127.0.0.1:8080` node pid **3088** (visible cmd **11664**, `scripts\start-windows-mvp.cmd`) |
| Nexus | `127.0.0.1:8187` llama-server **2132** `tool-router-agent` resident |
| Chat specialist | `127.0.0.1:8184` llama-server **12132** `general-text-speculator` ready (not resident) |
| Started | 2026-09-07 01:26:55 local / 08:26 UTC |
| Stale pid 12252 | dead; this bounce replaced it |

## Health JSON

HTTP **200**, `"status": "degraded"`, `"product": "Green-Roomz"`, `"policy": "responsive"`. Snapshot `data/health-now.json` at 08:53:07 UTC (`uptime_ms` ~1.57e6).

Callable tonight: `tool-router-agent` ready/resident, `general-text-speculator` ready, `security-monitor-agent` ready (logical), `speech-synthesis-agent` cold. Vision / whisper / code-7B / embed / rerank / guard / image-gen **unavailable** (missing files) — honest 503 path.

## Battery

`scripts\mvp-parity-battery.cmd` → **Overall PASS** (pass=7 fail=0 skip=0).

`data/mvp-parity-last.json` started **08:35:10 UTC**, finished **08:39:51 UTC**. Console: `data/mvp-parity-console.txt`.

| Case | ms | Note |
|---|---:|---|
| A health | 60 | `status=degraded` |
| B models | 24 | 11 aliases |
| **C** non-stream | **17198** | reply `parity-ok` |
| **D** multi-turn | **91175** | no literal Ada (soft pass) |
| **E** SSE | **80632** | 51 `data:` lines, `done=True` |
| F abort | 841 | client killed early |
| **G** system+user | **90350** | HTTP 200, wording garbage |

## Sample reply

Prompt: `Say hello in one short sentence.` → `POST /v1/chat/completions` `model=general-text-speculator`.

**Client-like (no `lock_alias`)** — **11109 ms**, HTTP 200, `x-green-roomz-route-reason: chat_default`, effective `general-text-speculator` (warm Instruct; bounced 10:03 UTC):

> **Reason:** The user is requesting to say hello. **Summary:** Hello!

**Pinned (`lock_alias: true`)** — **8139 ms**, HTTP 200, effective `general-text-speculator`:

> **Reason:**

Cold first turn after bounce still exceeds 60s (mmap + graph). After Instruct is ready, generic clients get chat in ~11s, not 107s of router junk. `/draw` stays **503**.

Quote the pinned line as the specialist quality sample. Quote the fallback blob as what a generic ChatGPT client can still get.

## vs ChatGPT % (from `docs/reviews/beta-vs-chatgpt.md`)

| Lens | Tonight | Move |
|---|---|---|
| Client contract | **55–70%** | no upward revision (E 80.6s vs 68.6s; abort still client-only) |
| Product | **12–20%** | unslashed hello is Instruct `chat_default` ~11s (was 107s router junk). Wording still 0.5B. |

## Blockers for “feels like ChatGPT”

1. **Wrong brain on unslashed chat — mitigated when Instruct is warm.** Generic `model=general-text-speculator` now `chat_default` (skip nexus, skip HANDOFF peek). Cold mmap still >60s; serve now pre-warms + `pinned: true` on Instruct. 0.5B wording is still “Reason/Summary”, not a clean hello.
2. **Tiny Instruct quality.** Case D did not recall “Ada”. Case G ignored the one-word system prompt. Replies mix `ack`, markdown, and `tool-router-agent` checklists.
3. **Speed.** Warm one-shot ~17s (C); stream ~81s (E); multi-turn/system ~90s (D/G). ~3 tok/s vs 50–100+ tok/s. Nexus consult cap 10s sits on the unslashed TTFB.
4. **No stop ACK.** Case F only proves the client can hang up. No server cancel.
5. **Missing modalities stay missing.** `/draw` `/imagine` `/tts` / vision / code-7B / tools / web are 503 or unavailable. Health stays `degraded` with 11 listed aliases, most hollow.
6. **Single-slot CPU.** `--parallel 1`, `max_warm_specialists: 1`. A second eval on :8080 starved the hello POST (180s timeout) until it finished. ChatGPT does not stall the whole product on one Athlon thread.
7. **Idle evict.** Specialist is not resident (`idle_evict_ms` 120000). After quiet, the next turn pays mmap again unless `lock_alias` hits a still-warm :8184.

Keep missing specialists as **503**. Do not fake a ChatGPT SPA. Dogfood `scripts\chat-mvp.cmd` with `/text` or `lock_alias` if the goal is a short, honest sentence.
